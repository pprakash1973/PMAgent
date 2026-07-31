require('dotenv').config({ path: '.env.local' });
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓ set (' + process.env.ANTHROPIC_API_KEY.slice(0,12) + '...)' : '✗ missing');
console.log('OPENAI_API_KEY:   ', process.env.OPENAI_API_KEY    ? '✓ set (' + process.env.OPENAI_API_KEY.slice(0,12) + '...)' : '✗ missing');
console.log('DEEPSEEK_API_KEY: ', process.env.DEEPSEEK_API_KEY  ? '✓ set (' + process.env.DEEPSEEK_API_KEY.slice(0,12) + '...)' : '✗ missing');
