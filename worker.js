// Web Worker v2 — Final optimized: minimal allocations, fastest filtering
'use strict';
let C=[];

self.onmessage=function(e){
const m=e.data,t=m.type,p=m.payload;
if(t==='SET_CHANNELS'){C=p||[];self.postMessage({type:'CHANNELS_SET',count:C.length})}
else if(t==='FILTER')self.postMessage({type:'FILTERED',data:FC(p.search,p.category)});
else if(t==='BUILD_CATEGORIES')self.postMessage({type:'CATEGORIES',data:BC()});
else if(t==='FILTER_SUGGESTIONS')self.postMessage({type:'FILTERED_SUGGESTIONS',data:FS(p)});
};

function FC(search,category){
const q=(search||'').toLowerCase(),all=category==='All',out=[];
for(let i=0,l=C.length;i<l;i++){
const c=C[i];
if(c&&c.name&&c.name.toLowerCase().indexOf(q)!==-1&&(all||c.category===category))out.push(c);
}
return out;
}

function BC(){
const s=['All'],v={'All':1};
for(let i=0,l=C.length;i<l;i++){
const c=C[i]&&C[i].category;
if(c&&c.trim()&&!v[c]){v[c]=1;s.push(c.trim())}
}
// Insertion sort (fast for small arrays)
for(let i=1;i<s.length;i++){const x=s[i];let j=i-1;while(j>=0&&s[j]>x){s[j+1]=s[j];j--}s[j+1]=x}
return s;
}

function FS(q){
if(!q||q.length<2)return[];
const ql=q.toLowerCase(),out=[],v={};
for(let i=0,l=C.length;i<l&&out.length<8;i++){
const c=C[i];
if(c&&c.name&&c.name.toLowerCase().indexOf(ql)!==-1&&!v[c.name]){v[c.name]=1;out.push({name:c.name,category:c.category})}
}
return out;
}
