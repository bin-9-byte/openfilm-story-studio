import {api,call} from '../api';

const extensions: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
/** Use the native local asset importer; never overwrite an earlier image needed for undo/redo. */
export async function importStoryImage(projectId: string, blob: Blob): Promise<string> {
  let home=projectId,prefix='';
  const seen=new Set<string>();
  for (;;) {
    if(seen.has(home)) throw new Error('工程父级关系异常。');
    seen.add(home);
    const film=await api.film(home);
    if(!film.outer) break;
    home=film.outer.id;prefix+='../../';
  }
  const extension = extensions[blob.type];
  if (!extension) throw new Error('请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。');
  const decoded = await createImageBitmap(blob);
  decoded.close();
  const path = `assets/storyboards/${crypto.randomUUID()}.${extension}`;
  const result = await call<{path:string;unreadable?:string}>(`projects/${encodeURIComponent(home)}/files?path=${encodeURIComponent(path)}`,{method:'PUT',body:blob});
  if (result.unreadable) throw new Error(`无法读取分镜图片：${result.unreadable}`);
  return prefix+result.path;
}
export function storyImageUrl(path: string, base: string) { return new URL(path,base).href; }
export async function storedStoryImage(path: string, base: string): Promise<Blob> {
  const url = new URL(path,base);
  if (url.protocol !== 'data:' && url.origin !== new URL(base).origin) throw new Error('请将外部参考图下载后从本机添加。');
  const response = await fetch(url);
  if (!response.ok) throw new Error('无法读取已保存的分镜图。');
  return response.blob();
}
