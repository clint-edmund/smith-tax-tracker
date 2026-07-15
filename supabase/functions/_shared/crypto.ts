export const b64ToBytes=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
export const bytesToB64=(v:Uint8Array)=>{let s="";for(const b of v)s+=String.fromCharCode(b);return btoa(s)};
export async function importKey(v:string){const b=b64ToBytes(v);if(b.length!==32)throw new Error("Encryption key must decode to 32 bytes");return crypto.subtle.importKey("raw",b,{name:"AES-GCM"},false,["encrypt","decrypt"])}
export async function encryptValue(k:CryptoKey,v:string){const iv=crypto.getRandomValues(new Uint8Array(12));const e=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,new TextEncoder().encode(v));return{ciphertext:bytesToB64(new Uint8Array(e)),iv:bytesToB64(iv)}}
export async function decryptValue(k:CryptoKey,c:string,i:string){const d=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(i)},k,b64ToBytes(c));return new TextDecoder().decode(d)}
export async function hashValue(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return bytesToB64(new Uint8Array(d))}
