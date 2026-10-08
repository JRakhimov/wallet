import 'dotenv/config';
import { createApp } from './app';
import { readConfig } from './config';
async function main() {
  const config=readConfig();
  const app=await createApp(config);
  await app.listen(config.port,config.host);
  console.log('Wallet API: http://'+config.host+':'+config.port+' | auth: '+(config.dev?'LOCAL DEVELOPMENT':'TELEGRAM'));
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Startup failed');process.exit(1);});
