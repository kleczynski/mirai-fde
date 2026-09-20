import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/brief-e2e',timeout:60000,retries:0,workers:1,
 use:{baseURL:'http://127.0.0.1:5174',headless:true,viewport:{width:1440,height:1000}},
 webServer:{command:'npx tsx scripts/brief-e2e-server.ts',url:'http://127.0.0.1:5174/tests/harness/brief.html',reuseExistingServer:false},
});
