import { registerAs } from '@nestjs/config';

export default registerAs('anthropic', () => ({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
}));
