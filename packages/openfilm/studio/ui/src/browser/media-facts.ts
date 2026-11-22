/** Decode metadata on the device before import; no upload or transcoding service. */
export async function browserMediaFacts(file:Blob&{name?:string}):Promise<Record<string,unknown>>{
  const name=file.name??'';
  if(file.type.startsWith('image/')||/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(name)){
    try{const bitmap=await createImageBitmap(file);const facts={width:bitmap.width,height:bitmap.height,audio:false};bitmap.close();return facts;}catch{return {audio:false};}
  }
  const audio=file.type.startsWith('audio/')||/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(name);
  if(!audio&&!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(name))return {};
  return new Promise(resolve=>{
    const media=document.createElement(audio?'audio':'video'),url=URL.createObjectURL(file);
    const finish=(facts:Record<string,unknown>)=>{clearTimeout(timer);media.removeAttribute('src');media.load();URL.revokeObjectURL(url);resolve(facts);};
    const timer=setTimeout(()=>finish({audio,undecodable:true}),8000);
    media.preload='metadata';media.onloadedmetadata=()=>finish({duration:media.duration,audio,...(media instanceof HTMLVideoElement?{width:media.videoWidth,height:media.videoHeight}:{})});
    media.onerror=()=>finish({audio,undecodable:true});media.src=url;
  });
}
