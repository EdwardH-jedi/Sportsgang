const fs=require('fs'),ts=require(process.cwd()+'/node_modules/typescript');
const filename=process.cwd()+'/apps/mobile/src/lib/messages.ts';
const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};new Function('exports','require','module',code)(m.exports,require,m);
const naive='2026-10-02T15:30:00',aware=naive+'Z',now=new Date('2026-10-02T16:00:00Z');
const r={deviceTimezone:process.env.TZ,naiveParsedInstant:new Date(naive).toISOString(),awareParsedInstant:new Date(aware).toISOString(),naiveVisible:m.exports.formatPreviewTimestamp(naive,now),correctVisible:m.exports.formatPreviewTimestamp(aware,now),naiveBlockDate:new Date(naive).toLocaleDateString('en-AU'),correctBlockDate:new Date(aware).toLocaleDateString('en-AU'),mixedNaiveTimeline:['2026-10-02T15:30:00','2026-10-02T15:31:00'].sort()};
console.log(JSON.stringify(r,null,2));
