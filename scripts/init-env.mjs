import { copyFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  console.log('.env.local already exists.');
} else {
  copyFileSync('.env.example', '.env.local');
  console.log('Created .env.local from .env.example.');
}
