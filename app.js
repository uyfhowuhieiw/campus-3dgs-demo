const $=id=>document.getElementById(id);
const state=window.sceneState={modelRevision:'joint-video-20261106-clean-v1',expectedBytes:7883296,phase:'welcome',downloaded:0,modelCount:0,renderCount:0,error:null};
let viewer,api,pose,blobUrl,loadingTimer,toastTimer;
let poses=[],poseIndex=0;
const assetRevision='f3f0145be823ddb3158223b7ca827c36fe2bcf38';
const cdnBase=location.hostname==='127.0.0.1'?new URL('./',location.href).href:`https://fastly.jsdelivr.net/gh/uyfhowuhieiw/campus-3dgs-demo@${assetRevision}/`;
const workerUrls=[];
const mobile=matchMedia('(pointer:coarse)').matches;
if(!mobile)$('gesture-hint').textContent='拖动旋转 · 滚轮缩放';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function fail(message){state.phase='error';state.error=message;clearTimeout(loadingTimer);$('welcome').hidden=true;$('loading').hidden=true;$('controls').hidden=true;$('failure-message').textContent=message;$('failure').hidden=false;}
function progress(percent,title){$('progress').style.width=`${Math.min(100,percent)}%`;if(title)$('loading-title').textContent=title;}
function ready(){if(state.phase!=='loading')return;state.phase='ready';clearTimeout(loadingTimer);$('loading').hidden=true;$('controls').hidden=false;}
async function workerBlob(name){
 for(const url of [cdnBase+'assets/'+name,new URL('./assets/'+name,location.href).href]){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
  try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Component download failed');const text=await response.text();const blob=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));workerUrls.push(blob);return blob;}catch{}finally{clearTimeout(timer);}
 }
 throw Error('查看器组件下载失败，请稍后重试。');
}
async function prepareWorkers(){const names=['WorkerFetch-C9HaDI9p.js','WorkerSort-RglOWZwm.js','WorkerLod-DKtH0Yiu.js'];const urls=await Promise.all(names.map(workerBlob));globalThis.__campusWorkerUrls=Object.fromEntries(names.map((name,index)=>[name,urls[index]]));}
async function viewerModule(){let timer;try{return await Promise.race([import(cdnBase+'assets/viewer.js'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('CDN timed out')),25000);})]);}catch{return import('./assets/viewer.js');}finally{clearTimeout(timer);}}
async function downloadParts(url,signal,parts){
 const size=65536,total=state.expectedBytes,count=Math.ceil(total/size);let next=1;
 function progressBytes(bytes){state.downloaded+=bytes;const percent=Math.round(100*state.downloaded/total);progress(percent,`正在加载模型 ${percent}%`);}
 async function readPart(response,index){
  const start=index*size,end=Math.min(total-1,start+size-1);
  if(response.status!==206)throw Error('Model partial response missing');
  const range=response.headers.get('content-range');
  if(range&&range!==`bytes ${start}-${end}/${total}`)throw Error('Model range mismatch');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.byteLength!==end-start+1)throw Error('Model segment incomplete');
  parts[index]=bytes;progressBytes(bytes.byteLength);
 }
 async function fetchPart(index){
  const start=index*size,end=Math.min(total-1,start+size-1);
  for(let attempt=0;attempt<2;attempt++){
   const pieceController=new AbortController(),abort=()=>pieceController.abort();signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)pieceController.abort();
   const timer=setTimeout(abort,12000);
   try{
    const response=await fetch(url,{signal:pieceController.signal,headers:{Range:`bytes=${start}-${end}`}});
    if(index===0&&response.status===200)return response;
    await readPart(response,index);return null;
   }catch(error){if(signal.aborted||attempt===1)throw error;}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
 }
 let first=null;
 try{if(!parts[0])first=await fetchPart(0);}catch(error){if(signal.aborted)throw error;}
 if(first?.status===200){
  state.downloaded=0;
  const chunks=[];
  if(first.body?.getReader){const reader=first.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);progressBytes(value.byteLength);}}
  else{const bytes=new Uint8Array(await first.arrayBuffer());chunks.push(bytes);progressBytes(bytes.byteLength);}
  return chunks;
 }
 async function worker(){
  while(next<count){const index=next++;if(!parts[index])try{await fetchPart(index);}catch(error){if(signal.aborted)throw error;}}
 }
 await Promise.all(Array.from({length:4},worker));
 if(parts.filter(Boolean).length!==count)throw Error('Some model segments are missing');
 return parts;
}

async function download(){
 const parts=[];
 const sources=[cdnBase+'scene.splat',new URL('./scene.splat',location.href).href];
 for(const [routeIndex,url] of sources.entries()){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);state.downloaded=parts.reduce((sum,p)=>sum+(p?.byteLength||0),0);
 try{
 const total=state.expectedBytes;
 const blobParts=await downloadParts(url,controller.signal,parts);
 const chunks=blobParts;
 if(state.downloaded!==total)throw Error('模型下载未完成，请检查网络后重试。');
 const blob=new Blob(chunks,{type:'application/octet-stream'});
 state.modelSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 if(state.modelSha256!=='587f1f4f88f5e3fa0411488cc6dc1db27d6be34fefa57c18046ecc38c9dc8dda')throw Error('模型校验失败，请重新加载。');
 state.source=url;return blob;
 }catch(error){if(routeIndex===sources.length-1)throw Error('模型下载失败，请检查网络后重试。');progress(0,'网络较慢，正在尝试备用线路…');}finally{controller.abort();clearTimeout(timer);}
 }
}
function observe(bus){const original=bus.fire.bind(bus);bus.fire=(event,...args)=>{if(event===api.Information&&args[0]){const info=args[0];if(info.modelSplatCount!==undefined)state.modelCount=info.modelSplatCount;if(info.renderSplatCount!==undefined){state.renderCount=info.renderSplatCount;if(state.renderCount>0)ready();}}return original(event,...args);};}
async function enter(){
 if(state.phase==='loading'||state.phase==='ready')return;
 state.phase='loading';$('welcome').hidden=true;$('failure').hidden=true;$('loading').hidden=false;
 try{
  const probe=document.createElement('canvas');if(!probe.getContext('webgl2'))throw Error('当前浏览器无法显示三维场景。请使用手机自带浏览器或新版 Chrome 打开。');
  loadingTimer=setTimeout(()=>fail('加载时间较长。请检查网络后重新加载。'),240000);
  const loaded=await Promise.all([viewerModule(),fetch('./view.json').then(r=>{if(!r.ok)throw Error('视角文件读取失败。');return r.json();}),download(),prepareWorkers()]);
  if(state.phase==='error')return;
  [api,pose]=loaded;poses=await fetch('./views.json').then(r=>r.json());progress(100,'正在显示场景…');
  viewer=window.campusViewer=new api.Reall3dViewer({root:'#gsviewer',debugMode:false,autoRotate:false,disableDropLocalFile:true,disableTransitionEffectOnLoad:true,pointcloudMode:false,shDegree:0,background:'#10252a',qualityLevel:mobile?3:5,position:pose.position,lookAt:pose.lookAt,lookUp:pose.lookUp,fov:pose.fov||65,maxDistance:10000});
  observe(viewer.events);observe(viewer.splatMesh.events);
  viewer.events.fire(api.GetRenderer).domElement.addEventListener('webglcontextlost',()=>fail('三维显示已中断，请重新加载。'));
  blobUrl=URL.createObjectURL(loaded[2]);await viewer.addModel({url:blobUrl,format:'splat'});
 }catch(error){console.error(error);fail(error.message||'查看器加载失败，请稍后重试。');}
}
$('enter').onclick=enter;
$('retry').onclick=()=>location.reload();
$('home').onclick=()=>{if(!viewer)return;poseIndex=0;pose=poses[0];$('view-name').textContent=pose.label;viewer.options({...pose,autoRotate:false});};
function zoom(factor){if(!viewer)return;const camera=viewer.events.fire(api.GetCamera);const controls=viewer.events.fire(api.GetControls);const distance=camera.position.distanceTo(controls.target);if((factor<1&&distance<.2)||(factor>1&&distance>1000))return;camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();viewer.events.fire(api.ViewerNeedUpdate);}
$('next-view').onclick=()=>{if(!viewer)return;poseIndex=(poseIndex+1)%poses.length;pose=poses[poseIndex];viewer.options({...pose,autoRotate:false});$('view-name').textContent=pose.label;};
$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);
$('share').onclick=async()=>{const url=location.href.split('#')[0];try{await navigator.clipboard.writeText(url);toast('链接已复制，可以粘贴到微信');}catch{const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();toast(copied?'链接已复制，可以粘贴到微信':'请复制浏览器地址栏中的链接');}};
document.querySelector('.brand').onclick=event=>{event.preventDefault();if(viewer)$('home').click();};
addEventListener('pagehide',()=>{viewer?.dispose();if(blobUrl)URL.revokeObjectURL(blobUrl);workerUrls.forEach(url=>URL.revokeObjectURL(url));});
addEventListener('unhandledrejection',event=>{if(state.phase==='loading')fail('查看器启动失败，请重新加载。');});
