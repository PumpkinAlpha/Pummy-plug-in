import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url)),chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const env={...process.env,PUMMY_BROWSER_EXECUTABLE:process.env.PUMMY_BROWSER_EXECUTABLE||(process.platform==='win32'&&existsSync(chrome)?chrome:chromium.executablePath()),PUMMY_TUTOR_QA_DIR:resolve(root,'work/audit-tutor'),PUMMY_WORKSPACE_QA_DIR:resolve(root,'work/audit-browser'),PUMMY_EXPLANATION_QA_DIR:resolve(root,'work/audit-explanations')};
for(const file of ['workspace-browser.mjs','explanations-browser.mjs','figma-browser.mjs','tutor-browser.mjs','course-uploads-browser.mjs','review-fixes-browser.mjs','bank-import-browser.mjs']){
 const result=spawnSync(process.execPath,[resolve(root,'test',file)],{cwd:root,env,stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
console.log('All seven browser suites passed. Native PowerPoint conversion '+(env.PUMMY_TEST_CONVERSION==='1'?'was enabled.':'was not tested; set PUMMY_TEST_CONVERSION=1 and PUMMY_SOFFICE to an installed LibreOffice executable to enable it.'));
