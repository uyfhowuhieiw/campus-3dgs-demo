const $=id=>document.getElementById(id);
const state=window.sceneState={phase:'welcome',downloaded:0,modelCount:0,renderCount:0,error:null};
let viewer,api,pose,blobUrl,loadingTimer,toastTimer;
const mobile=matchMedia('(pointer:coarse)').matches;
if(!mobile)$('gesture-hint').textContent='拖动旋转 · 滚轮缩放';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function fail(message){state.phase='error';state.error=message;clearTimeout(loadingTimer);$('welcome').hidden=true;$('loading').hidden=true;$('controls').hidden=true;$('failure-message').textContent=message;$('failure').hidden=false;}
function progress(percent,title){$('progress').style.width=`${Math.min(100,percent)}%`;if(title)$('loading-title').textContent=title;}
function ready(){if(state.phase!=='loading')return;state.phase='ready';clearTimeout(loadingTimer);$('loading').hidden=true;$('controls').hidden=false;}
async function download(){
 const response=await fetch(new URL('./scene.splat',location.href));if(!response.ok)throw Error('模型下载失败，请检查网络后重试。');
 const total=11722176;const chunks=[];
 if(response.body?.getReader){const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);state.downloaded+=value.byteLength;const percent=Math.min(100,Math.round(100*state.downloaded/total));progress(percent,`正在加载模型 ${percent}%`);}}
 else{chunks.push(new Uint8Array(await response.arrayBuffer()));state.downloaded=chunks[0].byteLength;progress(100,'正在显示场景…');}
 if(state.downloaded!==total)throw Error('模型下载未完成，请检查网络后重试。');
 return new Blob(chunks,{type:'application/octet-stream'});
}
function observe(bus){const original=bus.fire.bind(bus);bus.fire=(event,...args)=>{if(event===api.Information&&args[0]){const info=args[0];if(info.modelSplatCount!==undefined)state.modelCount=info.modelSplatCount;if(info.renderSplatCount!==undefined){state.renderCount=info.renderSplatCount;if(state.renderCount>0)ready();}}return original(event,...args);};}
async function enter(){
 if(state.phase==='loading'||state.phase==='ready')return;
 state.phase='loading';$('welcome').hidden=true;$('failure').hidden=true;$('loading').hidden=false;
 try{
  const probe=document.createElement('canvas');if(!probe.getContext('webgl2'))throw Error('当前浏览器无法显示三维场景。请使用手机自带浏览器或新版 Chrome 打开。');
  loadingTimer=setTimeout(()=>fail('加载时间较长。请检查网络后重新加载。'),120000);
  const loaded=await Promise.all([import('./assets/viewer.js'),fetch('./view.json').then(r=>{if(!r.ok)throw Error('视角文件读取失败。');return r.json();}),download()]);
  if(state.phase==='error')return;
  [api,pose]=loaded;progress(100,'正在显示场景…');
  viewer=window.campusViewer=new api.Reall3dViewer({root:'#gsviewer',debugMode:false,autoRotate:false,disableDropLocalFile:true,disableTransitionEffectOnLoad:true,pointcloudMode:false,shDegree:0,background:'#10252a',qualityLevel:mobile?3:5,position:pose.position,lookAt:pose.lookAt,lookUp:pose.lookUp,fov:65,maxDistance:10000});
  observe(viewer.events);observe(viewer.splatMesh.events);
  viewer.events.fire(api.GetRenderer).domElement.addEventListener('webglcontextlost',()=>fail('三维显示已中断，请重新加载。'));
  blobUrl=URL.createObjectURL(loaded[2]);await viewer.addModel({url:blobUrl,format:'splat'});
 }catch(error){console.error(error);fail(error.message||'查看器加载失败，请稍后重试。');}
}
$('enter').onclick=enter;
$('retry').onclick=()=>location.reload();
$('home').onclick=()=>{if(viewer)viewer.options({...pose,fov:65,autoRotate:false});};
function zoom(factor){if(!viewer)return;const camera=viewer.events.fire(api.GetCamera);const controls=viewer.events.fire(api.GetControls);const distance=camera.position.distanceTo(controls.target);if((factor<1&&distance<.2)||(factor>1&&distance>1000))return;camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);controls.update();viewer.events.fire(api.ViewerNeedUpdate);}
$('zoom-in').onclick=()=>zoom(.8);$('zoom-out').onclick=()=>zoom(1.25);
$('share').onclick=async()=>{const url=location.href.split('#')[0];try{await navigator.clipboard.writeText(url);toast('链接已复制，可以粘贴到微信');}catch{const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();toast(copied?'链接已复制，可以粘贴到微信':'请复制浏览器地址栏中的链接');}};
document.querySelector('.brand').onclick=event=>{event.preventDefault();if(viewer)$('home').click();};
addEventListener('pagehide',()=>{viewer?.dispose();if(blobUrl)URL.revokeObjectURL(blobUrl);});
addEventListener('unhandledrejection',event=>{if(state.phase==='loading')fail('查看器启动失败，请重新加载。');});
