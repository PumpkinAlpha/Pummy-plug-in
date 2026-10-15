import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfEmphasis,nonBlack,pptxEmphasis} from '../lib/professor-emphasis.js';
import {parseXml,pptxMetadata} from '../lib/tutor/presentations.js';
import {nativePPTX} from './native-fixtures.mjs';
test('original non-black text and highlight/circle annotations become source cues',()=>{
 const OPS={save:1,restore:2,setFillRGBColor:3,setFillGray:4,showText:5,showSpacedText:6};
 const ops={fnArray:[3,5,1,3,5,2,5],argsArray:[['#ff0000'],[[{unicode:'Colored focus'}]],[],['#000000'],[[{unicode:'Black text'}]],[],[[{unicode:'Red again'}]]]};
 const cues=pdfEmphasis(ops,OPS,[{subtype:'Highlight',rect:[10,10,30,20]},{subtype:'Circle',rect:[40,20,60,40]}],{width:100,height:100,convertToViewportRectangle:r=>r});
 assert.deepEqual(cues.map(c=>c.kind),['colored_text','colored_text','highlight','circle']);assert.ok(cues.every(c=>c.origin==='original'));assert.equal(cues[0].text,'Colored focus');assert.ok(!cues.some(c=>c.text==='Black text'));assert.equal(nonBlack('000000'),false);assert.equal(nonBlack('FF0000'),true);
});
test('PowerPoint run highlights and non-black font colors are extracted from original DrawingML',()=>{
 const xml='<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:sp><p:txBody><a:p><a:r><a:rPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:highlight><a:srgbClr val="FFFF00"/></a:highlight></a:rPr><a:t>Professor focus</a:t></a:r><a:r><a:rPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t>Ordinary text</a:t></a:r></a:p></p:txBody></p:sp></p:sld>';
 const cues=pptxEmphasis(parseXml(xml),100,100);assert.deepEqual(cues.map(c=>c.kind),['highlight','colored_text']);assert.ok(cues.every(c=>c.text==='Professor focus'));
 const deck=pptxMetadata(nativePPTX());assert.ok(deck.slides[0].emphasis.some(c=>c.kind==='circle'&&c.region));
});
