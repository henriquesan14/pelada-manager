import { afterEach, expect, it, vi } from 'vitest';
import { preparePhoto } from './photo';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('reduz foto grande do celular sem depender de createImageBitmap',async()=>{
  vi.stubGlobal('Image',class {naturalWidth=4000;naturalHeight=3000;onload=()=>{};set src(_:string){queueMicrotask(()=>this.onload());}});
  vi.stubGlobal('createImageBitmap',undefined);
  const revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:()=> 'blob:photo',revokeObjectURL:revoke});
  const draw=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillRect:vi.fn(),drawImage:draw} as any);
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(this:HTMLCanvasElement,callback){expect(this.width).toBe(1920);expect(this.height).toBe(1440);callback(new Blob(['jpeg'],{type:'image/jpeg'}));});
  const result=await preparePhoto(new File([new Uint8Array(9*1024*1024)],'camera.jpg',{type:'image/jpeg'}));
  expect(result.type).toBe('image/jpeg');expect(result.size).toBeLessThan(1024);expect(draw).toHaveBeenCalled();expect(revoke).toHaveBeenCalledWith('blob:photo');
});
it('explica erro de formato e libera a URL temporária',async()=>{
  vi.stubGlobal('Image',class {onerror=()=>{};set src(_:string){queueMicrotask(()=>this.onerror());}});
  const revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:()=> 'blob:bad',revokeObjectURL:revoke});
  await expect(preparePhoto(new File(['bad'],'foto.heic'))).rejects.toThrow('Não foi possível abrir');
  expect(revoke).toHaveBeenCalledWith('blob:bad');
});
