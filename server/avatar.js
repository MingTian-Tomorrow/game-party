import {inflateSync} from 'node:zlib';
import {fail} from './rules.js';

// The browser produces a small, non-interlaced RGBA PNG. Reject other payloads.
export function avatarBytes(value){
 if(typeof value!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail('请上传处理后的 PNG 头像');
 const b=Buffer.from(value.slice(22),'base64');
 if(b.length>96*1024)fail('头像文件过大，请换一张图片');
 if(b.length<57||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('头像图片无效');
 let offset=8,width=0,height=0,ended=false;const data=[];
 while(offset+12<=b.length){
  const size=b.readUInt32BE(offset),type=b.toString('ascii',offset+4,offset+8);
  if(size>b.length-offset-12)fail('头像图片不完整');
  if(offset===8&&type!=='IHDR')fail('头像图片无效');
  const chunk=b.subarray(offset+8,offset+8+size);
  if(type==='IHDR'){
   if(offset!==8||size!==13)fail('头像图片无效');
   width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);
   if(width!==128||height!==128||chunk[8]!==8||![2,6].includes(chunk[9])||chunk[10]||chunk[11]||chunk[12])fail('头像必须为 128 × 128 的标准 PNG');
  }else if(type==='IDAT')data.push(chunk);
  else if(type==='IEND'){if(size!==0||offset+12!==b.length)fail('头像图片无效');ended=true;break;}
  offset+=size+12;
 }
 if(!ended||!data.length)fail('头像图片不完整');
 try{const channels=b[25]===6?4:3,raw=inflateSync(Buffer.concat(data),{maxOutputLength:128*(128*4+1)});if(raw.length!==height*(width*channels+1))throw Error();for(let row=0;row<height;row++)if(raw[row*(width*channels+1)]>4)throw Error();}catch{fail('头像图片无法读取');}
 return b;
}
