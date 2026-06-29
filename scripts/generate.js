import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

function getTargetYYYYMM() {
  if (process.env.TARGET_YYYYMM) return process.env.TARGET_YYYYMM;
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function getGDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  console.log('サービスアカウント:', creds.client_email);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

async function findFolder(drive, parentId, name) {
  console.log(`フォルダ検索: "${name}" in ${parentId}`);
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  console.log('結果:', JSON.stringify(res.data.files));
  return res.data.files?.[0] ?? null;
}

async function listImages(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
  });
  return res.data.files ?? [];
}

async function downloadImageAsBase64(drive, fileId, mimeType) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data).toString('base64');
}

async function analyzeImagesWithClaude(images) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const imageContent = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
  }));
  const prompt = `これらはダンススタジオの月次スケジュール画像です。
全画像から以下のJSON形式でスケジュールデータを抽出してください。

出力形式（JSONのみ、説明不要）:
{
  "year": 2026,
  "month": 8,
  "schedule": {
    "1": [
      {
        "time": "20:30〜22:00",
        "classes": [
          {
            "genre": "hiphop 初心者向け",
            "teacher": "みつ",
            "song": "曲名",
            "artist": "アーティスト名"
          }
        ]
      }
    ]
  }
}

注意:
- キーは日付（数字の文字列）
- genreにレベルも含める（超入門/初心者向け/入初級/初級/中級/経験者向け/基礎）
- 曲名・アーティストが不明なら空文字
- 土曜日は時間帯が複数あるので全て抽出
- JSONのみ出力、余分なテキスト不要`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: [...imageContent, { type: 'text', text: prompt }] }],
  });
  const text = response.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON抽出失敗:\n' + text);
  return JSON.parse(match[0]);
}

function generateHTML(year, month, scheduleByDay) {
  const scheduleJSON = JSON.stringify(scheduleByDay);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ダンススタジオ ${year}年${month}月スケジュール</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #F1F5F9; font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', sans-serif; }
a:hover { opacity: 0.8; }
</style>
</head>
<body>
<div id="root"></div>
<script>
const {useState, useMemo} = React;
const YEAR=${year}, MONTH=${month};
const GC={
  hiphop:{bg:"#FF6B9D",light:"#FFE0ED",text:"#8B0038"},
  jazzfunk:{bg:"#A855F7",light:"#F3E8FF",text:"#5B0EA6"},
  jazz:{bg:"#3B82F6",light:"#DBEAFE",text:"#1E3A8A"},
  lock:{bg:"#F59E0B",light:"#FEF3C7",text:"#78350F"},
  "r&b":{bg:"#10B981",light:"#D1FAE5",text:"#064E3B"},
  house:{bg:"#6366F1",light:"#E0E7FF",text:"#312E81"},
  pop:{bg:"#EC4899",light:"#FCE7F3",text:"#831843"},
  "soul&hiphop":{bg:"#EF4444",light:"#FEE2E2",text:"#7F1D1D"},
  waack:{bg:"#8B5CF6",light:"#EDE9FE",text:"#4C1D95"},
  soul:{bg:"#F97316",light:"#FFEDD5",text:"#7C2D12"},
  "jazzfunk&heel":{bg:"#DB2777",light:"#FCE7F3",text:"#831843"},
  vogue:{bg:"#7C3AED",light:"#EDE9FE",text:"#4C1D95"},
};
function gc(genre){
  const k=genre.toLowerCase().replace(/\\s+/g,"");
  for(const[key,v] of Object.entries(GC)){
    const kk=key.replace(/&/g,"").replace(/\\s+/g,"");
    if(k.startsWith(kk.slice(0,5))||k.includes(kk.slice(0,5))) return v;
  }
  return {bg:"#94A3B8",light:"#F1F5F9",text:"#334155"};
}
function bdg(text){
  if(text.includes("超入門"))return{label:"超入門",color:"#22C55E"};
  if(text.includes("初心者向け"))return{label:"初心者",color:"#3B82F6"};
  if(text.includes("入初級"))return{label:"入初級",color:"#6366F1"};
  if(text.includes("中級チャレンジ"))return{label:"中級挑戦",color:"#F59E0B"};
  if(text.includes("初級"))return{label:"初級",color:"#8B5CF6"};
  if(text.includes("中級"))return{label:"中級",color:"#EF4444"};
  if(text.includes("経験者向け"))return{label:"経験者",color:"#DC2626"};
  if(text.includes("基礎"))return{label:"基礎",color:"#10B981"};
  if(text.includes("ペア振り"))return{label:"ペア♀限定",color:"#EC4899"};
  return null;
}
const yt=(s,a)=>"https://www.youtube.com/results?search_query="+encodeURIComponent((s||"")+" "+(a||""));
const SD=${scheduleJSON};
function ClassCard({cls}){
  const c=gc(cls.genre),b=bdg(cls.genre),u=yt(cls.song,cls.artist);
  return React.createElement("div",{style:{background:c.light,border:"1px solid "+c.bg,borderLeft:"4px solid "+c.bg,borderRadius:8,padding:"8px 10px",minWidth:0}},
    React.createElement("div",{style:{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:3}},
      React.createElement("span",{style:{background:c.bg,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,whiteSpace:"nowrap"}},cls.genre.split(" ")[0]),
      b&&React.createElement("span",{style:{background:b.color,color:"#fff",fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:20}},b.label),
      cls.teacher&&React.createElement("span",{style:{fontSize:11,fontWeight:600,color:"#374151"}},"👤 "+cls.teacher)
    ),
    cls.song&&React.createElement("a",{href:u,target:"_blank",rel:"noopener noreferrer",style:{fontSize:11,color:c.text,textDecoration:"none",display:"block",marginTop:2}},"♪ "+cls.song+(cls.artist?" / "+cls.artist:"")+" ▶")
  );
}
function TimeSlot({slot}){
  const cols=Math.min(3,slot.classes.length);
  return React.createElement("div",{style:{marginBottom:14}},
    React.createElement("div",{style:{fontSize:12,fontWeight:700,color:"#6B7280",marginBottom:6,padding:"2px 8px",background:"#E5E7EB",borderRadius:4,display:"inline-block"}},"🕐 "+slot.time),
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat("+cols+",1fr)",gap:6}},
      slot.classes.map((cls,i)=>React.createElement(ClassCard,{key:i,cls}))
    )
  );
}
function Modal({day,data,onClose}){
  if(!day)return null;
  const wd=["日","月","火","水","木","金","土"][new Date(YEAR,MONTH-1,day).getDay()];
  return React.createElement("div",{
    onClick:e=>{if(e.target===e.currentTarget)onClose();},
    style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,overflowY:"auto",padding:16,display:"flex",alignItems:"flex-start",justifyContent:"center"}
  },
    React.createElement("div",{style:{background:"#fff",borderRadius:16,width:"100%",maxWidth:640,padding:20,marginTop:8}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
        React.createElement("h2",{style:{fontSize:17,fontWeight:800,color:"#1F2937"}},YEAR+"年"+MONTH+"月"+day+"日（"+wd+"）"),
        React.createElement("button",{onClick:onClose,style:{background:"#F3F4F6",border:"none",borderRadius:"50%",width:32,height:32,fontSize:16,cursor:"pointer",color:"#6B7280"}},"✕")
      ),
      data.length===0
        ?React.createElement("p",{style:{color:"#9CA3AF",textAlign:"center",padding:"30px 0"}},"この日のクラスはありません")
        :data.map((slot,i)=>React.createElement(TimeSlot,{key:i,slot}))
    )
  );
}
function TeacherFilter({teachers,selected,onToggle,onClear}){
  return React.createElement("div",{style:{background:"#fff",borderRadius:10,padding:12,marginBottom:12,boxShadow:"0 1px 3px rgba(0,0,0,0.08)"}},
    React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}},
      React.createElement("span",{style:{fontWeight:700,fontSize:12,color:"#374151"}},"👩\u200d🏫 先生で絞り込み"),
      selected.size>0&&React.createElement("button",{onClick:onClear,style:{fontSize:11,color:"#6B7280",background:"none",border:"1px solid #D1D5DB",borderRadius:5,padding:"1px 7px",cursor:"pointer"}},"クリア")
    ),
    React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:5}},
      teachers.map(t=>React.createElement("button",{
        key:t,onClick:()=>onToggle(t),
        style:{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",
          border:selected.has(t)?"2px solid #6366F1":"1px solid #D1D5DB",
          background:selected.has(t)?"#EDE9FE":"#F9FAFB",
          color:selected.has(t)?"#4338CA":"#4B5563"}
      },t))
    )
  );
}
function App(){
  const [day,setDay]=useState(null);
  const [selT,setSelT]=useState(new Set());
  const allT=useMemo(()=>{
    const s=new Set();
    Object.values(SD).forEach(slots=>slots.forEach(slot=>slot.classes.forEach(cls=>{
      cls.teacher.split(/[&＆、,，]/).map(t=>t.trim()).filter(Boolean).forEach(t=>s.add(t));
    })));
    return Array.from(s).sort();
  },[]);
  const match=t=>{if(selT.size===0)return true;return t.split(/[&＆、,，]/).map(x=>x.trim()).some(x=>selT.has(x));};
  const fSD=useMemo(()=>{
    if(selT.size===0)return SD;
    const r={};
    Object.entries(SD).forEach(([d,slots])=>{
      const f=slots.map(s=>({...s,classes:s.classes.filter(c=>match(c.teacher))})).filter(s=>s.classes.length>0);
      if(f.length>0)r[+d]=f;
    });
    return r;
  },[selT]);
  const first=new Date(YEAR,MONTH-1,1).getDay();
  const off=(first+6)%7;
  const dim=new Date(YEAR,MONTH,0).getDate();
  const wl=["月","火","水","木","金","土","日"];
  const cells=[];
  for(let i=0;i<off;i++)cells.push(null);
  for(let d=1;d<=dim;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);
  const modalData=day?(fSD[day]||SD[day]||[]):[];
  return React.createElement("div",{style:{minHeight:"100vh",background:"#F1F5F9",padding:12}},
    React.createElement("div",{style:{maxWidth:700,margin:"0 auto"}},
      React.createElement("div",{style:{textAlign:"center",marginBottom:14}},
        React.createElement("h1",{style:{fontSize:20,fontWeight:900,color:"#1F2937"}},"💃 "+YEAR+"年"+MONTH+"月 ダンスクラス"),
        React.createElement("p",{style:{color:"#9CA3AF",fontSize:12,marginTop:3}},"日付をタップしてクラス詳細を確認")
      ),
      React.createElement(TeacherFilter,{teachers:allT,selected:selT,
        onToggle:t=>setSelT(prev=>{const n=new Set(prev);n.has(t)?n.delete(t):n.add(t);return n;}),
        onClear:()=>setSelT(new Set())}),
      React.createElement("div",{style:{background:"#fff",borderRadius:10,boxShadow:"0 1px 3px rgba(0,0,0,0.08)",overflow:"hidden",marginBottom:12}},
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}},
          wl.map((w,i)=>React.createElement("div",{key:w,style:{textAlign:"center",padding:"8px 0",fontSize:11,fontWeight:700,
            color:i===5?"#3B82F6":i===6?"#EF4444":"#6B7280",background:"#F9FAFB",borderBottom:"1px solid #E5E7EB"}},w))
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}},
          cells.map((d,idx)=>{
            const hasF=d&&fSD[d]!==undefined,hasAny=d&&SD[d]!==undefined;
            const dow=idx%7,isSat=dow===5,isSun=dow===6;
            return React.createElement("div",{key:idx,onClick:hasAny?()=>setDay(d):undefined,
              style:{minHeight:56,padding:5,borderRight:"1px solid #F3F4F6",borderBottom:"1px solid #F3F4F6",
                cursor:hasAny?"pointer":"default",background:"#fff"}},
              d&&React.createElement("div",{style:{fontWeight:600,fontSize:12,
                color:isSat?"#3B82F6":isSun?"#EF4444":"#374151",
                width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:3}},d),
              hasF&&React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:2}},
                fSD[d].flatMap(s=>s.classes).slice(0,5).map((cls,i)=>{
                  const c=gc(cls.genre);
                  return React.createElement("div",{key:i,style:{width:7,height:7,borderRadius:"50%",background:c.bg}});
                })
              )
            );
          })
        )
      ),
      React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6,padding:10,background:"#fff",borderRadius:10,boxShadow:"0 1px 3px rgba(0,0,0,0.08)"}},
        Object.entries(GC).map(([g,c])=>React.createElement("div",{key:g,style:{display:"flex",alignItems:"center",gap:3}},
          React.createElement("div",{style:{width:8,height:8,borderRadius:"50%",background:c.bg}}),
          React.createElement("span",{style:{fontSize:10,color:"#6B7280"}},g)
        ))
      )
    ),
    React.createElement(Modal,{day,data:modalData,onClose:()=>setDay(null)})
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
</script>
</body>
</html>`;
}

async function main() {
  const yyyymm = getTargetYYYYMM();
  const year = parseInt(yyyymm.slice(0, 4));
  const month = parseInt(yyyymm.slice(4, 6));
  console.log(`対象年月: ${year}年${month}月 (${yyyymm})`);
  console.log('GDRIVE_FOLDER_ID:', process.env.GDRIVE_FOLDER_ID);
  console.log('ANTHROPIC_API_KEY 設定済み:', !!process.env.ANTHROPIC_API_KEY);

  const drive = getGDriveClient();

  console.log('Schedule_img フォルダを検索中...');
  const scheduleImgFolder = await findFolder(drive, process.env.GDRIVE_FOLDER_ID, 'Schedule_img');
  if (!scheduleImgFolder) throw new Error('Schedule_img フォルダが見つかりません。フォルダの共有設定を確認してください。');

  console.log(`${yyyymm} フォルダを検索中...`);
  const monthFolder = await findFolder(drive, scheduleImgFolder.id, yyyymm);
  if (!monthFolder) throw new Error(`${yyyymm} フォルダが見つかりません`);

  console.log('画像一覧取得中...');
  const imageFiles = await listImages(drive, monthFolder.id);
  if (imageFiles.length === 0) throw new Error('画像が見つかりません');
  console.log(`${imageFiles.length}枚の画像を発見`);

  console.log('画像ダウンロード中...');
  const images = await Promise.all(
    imageFiles.map(async (f) => ({
      name: f.name,
      mimeType: f.mimeType,
      base64: await downloadImageAsBase64(drive, f.id, f.mimeType),
    }))
  );

  console.log('Claude で解析中...');
  const result = await analyzeImagesWithClaude(images);
  console.log(`抽出完了: ${Object.keys(result.schedule).length}日分`);

  const html = generateHTML(year, month, result.schedule);
  const outDir = path.join(process.cwd(), '..', yyyymm);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'index.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`✅ 生成完了: ${outPath}`);

  const rootIndex = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=/${yyyymm}/"><title>ダンススタジオ スケジュール</title></head><body><a href="/${yyyymm}/">最新スケジュールはこちら</a></body></html>`;
  fs.writeFileSync(path.join(process.cwd(), '..', 'index.html'), rootIndex, 'utf-8');
  console.log('✅ ルートindex.html更新完了');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  console.error(err.stack);
  process.exit(1);
});
