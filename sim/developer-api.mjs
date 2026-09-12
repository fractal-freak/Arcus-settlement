/** Bounded retries on the same free provider; never switch to paid capacity. */
export async function requestCompletion(body,{key,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const retryable=new Set([408,429,500,502,503,504]);
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{
   response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',{
    method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(60000),body:JSON.stringify(body)});
  }catch(error){if(attempt===2)throw Error('Gemini network request failed after 3 attempts');}
  if(response?.ok)return response.json();
  if(response&&!retryable.has(response.status))throw Error(`Gemini unavailable (${response.status}); not a transient error`);
  if(attempt===2)throw Error(`Gemini unavailable (${response?.status||'network'}); 3 attempts exhausted`);
  const retryAfter=Number(response?.headers?.get?.('retry-after'));
  const delay=Math.max([5000,15000][attempt],Number.isFinite(retryAfter)?Math.min(30000,retryAfter*1000):0);
  console.log(`Gemini temporary failure (${response?.status||'network'}); retry ${attempt+2}/3 after ${delay}ms`);
  await sleep(delay);
 }
}
