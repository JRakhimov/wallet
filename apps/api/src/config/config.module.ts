import { DynamicModule, Global, Module } from "@nestjs/common";
import { AppConfig, CONFIG } from "./app-config";

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
