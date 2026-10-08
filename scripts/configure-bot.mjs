import 'dotenv/config';

const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!/^\d+:[A-Za-z0-9_-]+$/.test(token || '')) throw new Error('Set BOT_TOKEN before configuring the bot');
const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ drop_pending_updates: false }),
  signal: AbortSignal.timeout(10000),
});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error('Telegram rejected deleteWebhook');
console.log('Webhook removed. Start the API to run the bot in polling mode.');
