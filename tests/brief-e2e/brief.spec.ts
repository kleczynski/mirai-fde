import { expect, test } from '@playwright/test';
test('operator generates Julka brief, inspects criticism, approves its version and downloads both formats',async({page})=>{
 await page.goto('/tests/harness/brief.html');
 await page.getByRole('button',{name:'Wygeneruj propozycję demo'}).click();
 await expect(page.getByRole('button',{name:'Zatwierdź tę wersję briefu'})).toBeVisible({timeout:30000});
 await page.getByText('Pełny brief do przeglądu',{exact:true}).click();
 await expect(page.getByText('mirai.build-brief.v1',{exact:false}).last()).toBeVisible();
 await page.screenshot({path:'.local/brief-studio/panel-review.png',fullPage:true});
 await page.getByRole('button',{name:'Zatwierdź tę wersję briefu'}).click();
 await expect(page.getByRole('button',{name:'Pobierz brief JSON'})).toBeVisible();
 for(const format of ['JSON','Markdown']) {
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:`Pobierz brief ${format}`}).click();
  expect((await download).suggestedFilename()).toMatch(format==='JSON'?/\.json$/:/\.md$/);
 }
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Pobierz brief JSON'})).toBeEnabled();
 await page.getByText('Pełny brief do przeglądu',{exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('button',{name:'Pobierz brief JSON'})).toBeVisible();
 await page.screenshot({path:'.local/brief-studio/panel-mobile.png',fullPage:true});
});
