import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'*.spec.mjs',timeout:120000,workers:1,use:{headless:true,viewport:{width:1440,height:960},channel:process.env.CI?undefined:'chrome'},webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4178',reuseExistingServer:!process.env.CI,timeout:15000},reporter:'list'});
