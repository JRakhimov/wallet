import 'reflect-metadata';
import { ArgumentsHost, Catch, Controller, DynamicModule, ExceptionFilter, Get, HttpException, Inject, Logger, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { resolve } from 'node:path';
import helmet from 'helmet';
import { AppConfig, CONFIG } from './config';
import { AuthController, AuthGuard, AuthService, Public } from './auth';
import { Database } from './database';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { TelegramBot } from './telegram-bot';

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) return res.status(error.getStatus()).json({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return res.status(409).json({ message:'Такая запись уже существует' });
      if (error.code === 'P2025') return res.status(404).json({ message:'Запись не найдена' });
    }
    Logger.error(error instanceof Error ? error.constructor.name : 'Unknown error','Request failed');
    res.status(500).json({ message:'Не удалось выполнить запрос. Попробуйте снова' });
  }
}
@Controller()
class InfrastructureController {
  constructor(private readonly db: Database) {}
  @Public() @Get('health')
  async health() { await this.db.$queryRaw`SELECT 1`; return { ok:true }; }

}
@Module({})
class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {module:AppModule,controllers:[AuthController,WalletController,InfrastructureController],providers:[
      {provide:CONFIG,useValue:config},Database,AuthService,WalletService,TelegramBot,{provide:APP_GUARD,useClass:AuthGuard},
    ]};
  }
}
export async function createApp(config: AppConfig, quiet=false) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {logger:quiet?false:['log','warn','error']});
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrors());
  app.use(helmet({ contentSecurityPolicy: {
    directives: {
      defaultSrc:["'self'"],scriptSrc:["'self'",'https://telegram.org'],styleSrc:["'self'","'unsafe-inline'"],
      imgSrc:["'self'",'data:'],connectSrc:["'self'"],frameAncestors:["'self'",'https://web.telegram.org','https://*.telegram.org'],
      upgradeInsecureRequests:config.env==='production'?[]:null,
    },
  }, crossOriginEmbedderPolicy:false, frameguard:false }));
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : [config.origin, ...(config.dev ? [config.origin.replace('localhost', '127.0.0.1')] : [])];
  app.enableCors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'] });
  app.use('/api',(_req:Request,res:Response,next:()=>void)=>{res.setHeader('Cache-Control','no-store');next();});
  const attempts=new Map<string,{time:number;count:number}>();
  app.use('/api/auth',(req:Request,res:Response,next:()=>void)=>{
    const now=Date.now(),key=req.socket.remoteAddress||'unknown';
    for(const [ip,entry] of attempts)if(now-entry.time>60_000)attempts.delete(ip);
    const entry=attempts.get(key)||{time:now,count:0};entry.count++;attempts.set(key,entry);
    if(entry.count>60)return res.status(429).json({message:'Слишком много попыток. Подождите минуту'});
    next();
  });
  if(config.env==='production'){
    const web=resolve(__dirname,'../../web/dist');
    app.useStaticAssets(web);
    app.use((req:Request,res:Response,next:()=>void)=>{
      if(req.method==='GET' && !req.path.startsWith('/api/')) return res.sendFile(resolve(web,'index.html'));
      next();
    });
  }
  app.enableShutdownHooks();
  return app;
}
