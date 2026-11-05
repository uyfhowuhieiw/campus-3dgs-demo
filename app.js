const $=id=>document.getElementById(id);
const state=window.sceneState={modelRevision:'new-video-20261106-6000',expectedBytes:8000000,phase:'welcome',downloaded:0,modelCount:0,renderCount:0,error:null};
let viewer,api,pose,blobUrl,loadingTimer,toastTimer;
let poses=[],poseIndex=0;
const assetRevision='ccad7e885604e71ac58d44004e9f7468d3f2544a';
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
async function download(){
 for(const url of [cdnBase+'scene.splat',new URL('./scene.splat',location.href).href]){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);state.downloaded=0;
 try{
 const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('模型下载失败，请检查网络后重试。');
 const total=8000000;const chunks=[];
 if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);state.downloaded+=value.byteLength;const percent=Math.min(100,Math.round(100*state.downloaded/total));progress(percent,`正在加载模型 ${percent}%`);}}
 else{chunks.push(new Uint8Array(await response.arrayBuffer()));state.downloaded=chunks[0].byteLength;progress(100,'正在显示场景…');}
 if(state.downloaded!==total)throw Error('模型下载未完成，请检查网络后重试。');
 state.source=url;return new Blob(chunks,{type:'application/octet-stream'});
 }catch(error){if(url===new URL('./scene.splat',location.href).href)throw Error('模型下载失败，请检查网络后重试。');progress(0,'网络较慢，正在尝试备用线路…');}finally{clearTimeout(timer);}
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
