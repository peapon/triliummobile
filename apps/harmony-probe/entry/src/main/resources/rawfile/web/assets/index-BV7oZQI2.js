(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})(),new Uint32Array([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]);function e(e,t=120){let n=e.replace(/<(script|style)[\s\S]*?<\/\1>/gi,` `).replace(/<[^>]+>/g,` `).replace(/&nbsp;/g,` `).replace(/&amp;/g,`&`).replace(/&lt;/g,`<`).replace(/&gt;/g,`>`).replace(/&quot;/g,`"`).replace(/\s+/g,` `).trim();return n.length>t?`${n.slice(0,t)}…`:n}var t={version:1,aspect:1,strokes:[]};function n(e){return{version:1,aspect:e>0?e:1,strokes:[]}}function r(e){if(!e)return{...t};try{let n=JSON.parse(e);if(!n||!Array.isArray(n.strokes))return{...t};let r=n.strokes.filter(e=>!!e&&Array.isArray(e.points)).map(e=>({id:String(e.id??``),color:String(e.color??`#e8eaed`),width:Number.isFinite(e.width)?Number(e.width):.004,tool:String(e.tool??`pen`),points:e.points.filter(e=>Number.isFinite(e?.x)&&Number.isFinite(e?.y)).map(e=>({x:a(e.x),y:a(e.y),...Number.isFinite(e.p)?{p:a(e.p)}:{}}))})).filter(e=>e.points.length>0);return{version:1,aspect:Number.isFinite(n.aspect)&&n.aspect>0?n.aspect:1,strokes:r}}catch{return{...t}}}function i(e){return JSON.stringify(e)}function a(e){return e<0?0:e>1?1:e}function o(e,t,n){return n.width<=0||n.height<=0?{x:0,y:0}:{x:a(e/n.width),y:a(t/n.height)}}function s(e,t){return Math.max(1,e.width*t)}var c=class{canvas;options;doc;drawing=null;lastPenAt=0;disposers=[];constructor(e,t,n={}){this.canvas=e,this.options=n,this.doc=t,this.attach(),this.redraw()}get document(){return this.doc}setDocument(e){this.doc=e,this.redraw()}get sawPen(){return this.lastPenAt>0}setStyle(e){e.color&&(this.options.color=e.color),e.width&&(this.options.width=e.width)}undo(){this.doc.strokes.length!==0&&(this.doc={...this.doc,strokes:this.doc.strokes.slice(0,-1)},this.redraw(),this.options.onChange?.(this.doc))}clear(){this.doc.strokes.length!==0&&(this.doc={...this.doc,strokes:[]},this.redraw(),this.options.onChange?.(this.doc))}destroy(){for(let e of this.disposers)e();this.disposers=[]}resize(){let e=this.canvas.getBoundingClientRect();if(e.width===0||e.height===0)return;let t=window.devicePixelRatio||1;this.canvas.width=Math.round(e.width*t),this.canvas.height=Math.round(e.height*t),this.redraw()}attach(){let e=e=>{if(!this.acceptPointer(e))return;this.canvas.setPointerCapture(e.pointerId),e.preventDefault(),e.pointerType===`pen`&&(this.lastPenAt=performance.now());let t=this.canvas.getBoundingClientRect();this.drawing={id:d(),color:this.options.color??`#e8eaed`,width:this.options.width??.004,tool:e.pointerType||`unknown`,points:[this.pointFrom(e,t)]},this.redraw()},t=e=>{if(!this.drawing||!this.acceptPointer(e))return;e.preventDefault();let t=this.canvas.getBoundingClientRect(),n=typeof e.getCoalescedEvents==`function`?e.getCoalescedEvents():[],r=n.length>0?n:[e];for(let e of r)this.drawing.points.push(this.pointFrom(e,t));this.redraw()},n=e=>{if(!this.drawing)return;e.pointerType===`pen`&&(this.lastPenAt=performance.now());let t=this.drawing;this.drawing=null,this.canvas.hasPointerCapture(e.pointerId)&&this.canvas.releasePointerCapture(e.pointerId),t.points.length>0&&(this.doc={...this.doc,strokes:[...this.doc.strokes,t]},this.options.onChange?.(this.doc)),this.redraw()},r=(e,t)=>{this.canvas.addEventListener(e,t),this.disposers.push(()=>this.canvas.removeEventListener(e,t))};r(`pointerdown`,e),r(`pointermove`,t),r(`pointerup`,n),r(`pointercancel`,n),this.canvas.style.touchAction=`none`}acceptPointer(e){if(e.pointerType!==`touch`)return!0;let t=this.options.palmRejectionMs??1500;return performance.now()-this.lastPenAt>t}pointFrom(e,t){let n=o(e.clientX-t.left,e.clientY-t.top,t);return e.pointerType===`pen`&&e.pressure>0&&(n.p=e.pressure),n}redraw(){l(this.canvas,this.doc,this.drawing?[this.drawing]:[])}};function l(e,t,n=[]){let r=e.getContext(`2d`);if(!r)return;let i=e.getBoundingClientRect(),a=window.devicePixelRatio||1,o=Math.max(1,Math.round((i.width||e.clientWidth||300)*a)),s=Math.max(1,Math.round((i.height||e.clientHeight||200)*a));e.width!==o&&(e.width=o),e.height!==s&&(e.height=s);let c=e.width/a,l=e.height/a;r.setTransform(a,0,0,a,0,0),r.clearRect(0,0,c,l);for(let e of[...t.strokes,...n])u(r,e,c,l)}function u(e,t,n,r){if(t.points.length===0)return;let i=s(t,n);if(e.strokeStyle=t.color,e.fillStyle=t.color,e.lineCap=`round`,e.lineJoin=`round`,t.points.length===1){let a=t.points[0];e.beginPath(),e.arc(a.x*n,a.y*r,i/2,0,Math.PI*2),e.fill();return}for(let a=1;a<t.points.length;a++){let o=t.points[a-1],s=t.points[a],c=s.p??o.p;e.lineWidth=c===void 0?i:i*(.4+1.2*c),e.beginPath(),e.moveTo(o.x*n,o.y*r),e.lineTo(s.x*n,s.y*r),e.stroke()}}function d(){let e=new Uint8Array(8);return crypto.getRandomValues(e),Array.from(e,e=>e.toString(16).padStart(2,`0`)).join(``)}function f(){let e=globalThis.triliumNative;return e&&typeof e.request==`function`?e:null}function p(){return f()!==null}function m(e){let t=``;for(let n=0;n<e.length;n+=32768){let r=e.subarray(n,n+32768);t+=String.fromCharCode(...r)}return btoa(t)}function h(e){if(e===``)return new Uint8Array;let t=atob(e),n=new Uint8Array(t.length);for(let e=0;e<t.length;e++)n[e]=t.charCodeAt(e);return n}async function ee(e){if(e==null)return``;if(typeof e==`string`)return m(new TextEncoder().encode(e));if(e instanceof Uint8Array)return m(e);if(e instanceof ArrayBuffer)return m(new Uint8Array(e));if(ArrayBuffer.isView(e))return m(new Uint8Array(e.buffer,e.byteOffset,e.byteLength));throw Error(`nativeFetch does not support stream request bodies`)}async function te(e,t={}){let n=f();if(!n)throw Error(`native bridge is not available`);let r=typeof e==`string`?e:e instanceof URL?e.toString():e.url,i=t.method??(typeof e==`object`&&`method`in e?e.method:`GET`),a={},o=t.headers??(typeof e==`object`&&`headers`in e?e.headers:void 0);o&&new Headers(o).forEach((e,t)=>{t.toLowerCase()!==`cookie`&&(a[t]=e)});let s=await ee(t.body),c=await n.request(i.toUpperCase(),r,JSON.stringify(a),s),l=JSON.parse(c);if(l.status===0)throw TypeError(l.error??`native request failed`);let u=h(l.body),d=l.status===204||l.status===304?null:u;return new Response(d,{status:l.status,statusText:``,headers:new Headers(l.headers??{})})}var g=class{worker;nextId=1;pending=new Map;progressHandler=null;constructor(e){this.worker=e,e.addEventListener(`message`,e=>{let t=e.data;if(`event`in t&&t.event===`progress`){this.progressHandler?.(t.progress);return}let n=t,r=this.pending.get(n.id);r&&(this.pending.delete(n.id),n.ok?r.resolve(n.result):r.reject(Error(n.error)))})}call(e,...t){let n=this.nextId++;return new Promise((r,i)=>{this.pending.set(n,{resolve:r,reject:i}),this.worker.postMessage({id:n,method:e,params:t})})}ready=()=>this.call(`ready`);isConfigured=()=>this.call(`isConfigured`);serverHost=()=>this.call(`serverHost`);counts=()=>this.call(`counts`);childrenOf=e=>this.call(`childrenOf`,e);childCount=e=>this.call(`childCount`,e);breadcrumb=e=>this.call(`breadcrumb`,e);getNote=e=>this.call(`getNote`,e);search=(e,t)=>this.call(`search`,e,t);recent=e=>this.call(`recent`,e);createTextNote=e=>this.call(`createTextNote`,e);inboxNoteId=()=>this.call(`inboxNoteId`);updateNoteContent=(e,t)=>this.call(`updateNoteContent`,e,t);loadInk=e=>this.call(`loadInk`,e);saveInk=(e,t)=>this.call(`saveInk`,e,t);maxBlobContentSize=()=>this.call(`maxBlobContentSize`);setMaxBlobContentSize=e=>this.call(`setMaxBlobContentSize`,e);fetchNoteBlob=e=>this.call(`fetchNoteBlob`,e);listAttachments=e=>this.call(`listAttachments`,e);fetchAttachmentBlob=e=>this.call(`fetchAttachmentBlob`,e);cacheStats=()=>this.call(`cacheStats`);setBlobBudget=e=>this.call(`setBlobBudget`,e);useNativeHttp=e=>this.call(`useNativeHttp`,e);configure=(e,t)=>this.call(`configure`,e,t);sync=()=>this.call(`sync`);pendingPushCount=()=>this.call(`pendingPushCount`);reset=()=>this.call(`reset`)};function _(){return window.matchMedia(`(min-width: 720px)`).matches}var v=`root`,y={tab:`capture`,query:``,browsePath:[v],openNoteId:null,syncing:!1,busy:!1,configured:!1,serverHost:null,pending:0,progress:null,lastMessage:``,lastOk:!0,toast:null,detailMode:`view`,inkDirty:!1,hasInk:!1},b=null,x=new Worker(new URL(`/assets/worker-Ctvn3wxF.js`,``+import.meta.url),{type:`module`}),S=new g(x);x.addEventListener(`message`,e=>{let t=e.data;if(t?.event!==`http`||typeof t.id!=`number`||!t.request)return;let n=t.request,r=n.bodyBase64?w(n.bodyBase64):void 0;te(n.url,{method:n.method,headers:n.headers,...r&&r.byteLength>0?{body:r}:{}}).then(async e=>{let n=new Uint8Array(await e.arrayBuffer()),r={};e.headers.forEach((e,t)=>{r[t]=e}),x.postMessage({event:`httpResult`,id:t.id,result:{status:e.status,headers:r,bodyBase64:C(n)}})}).catch(e=>{x.postMessage({event:`httpResult`,id:t.id,result:{status:0,headers:{},bodyBase64:``,error:e instanceof Error?e.message:String(e)}})})});function C(e){let t=``;for(let n=0;n<e.length;n+=32768)t+=String.fromCharCode(...e.subarray(n,n+32768));return btoa(t)}function w(e){let t=atob(e),n=new Uint8Array(t.length);for(let e=0;e<t.length;e++)n[e]=t.charCodeAt(e);return n}var T=document.getElementById(`app`);S.progressHandler=e=>{y.progress=e;let t=document.getElementById(`status`);t&&(t.textContent=e.message,t.className=`status ${e.phase===`error`?`bad`:`busy`}`)};async function ne(){T.innerHTML=`<div class="empty">正在打开本地数据库…</div>`;try{await S.ready();let e=p();await S.useNativeHttp(e),console.log(`shell: native bridge ${e?`active`:`absent`}, origin ${location.origin}`),await E(),console.log(`shell: configured=${y.configured}`),await D(),console.log(`shell: rendered`),await re()}catch(e){console.log(`shell: boot failed: ${e instanceof Error?e.stack??e.message:e}`),T.innerHTML=`
      <div class="setup">
        <h2>无法打开本地数据库</h2>
        <p>${Z(String(e))}</p>
      </div>`}}async function re(){}async function E(){y.configured=await S.isConfigured(),y.serverHost=await S.serverHost(),y.pending=y.configured?await S.pendingPushCount():0}async function D(){if(b?.destroy(),b=null,!y.configured){Y();return}let e=await j(),t=y.openNoteId?await I(y.openNoteId):``;T.innerHTML=`
    ${k()}
    <div class="view" id="view">${e}</div>
    ${A()}
    ${t}
    ${y.toast?`<div class="toast ${y.toast.bad?`bad`:``}">${Z(y.toast.text)}</div>`:``}
  `,O(),B()}function O(){let e=document.querySelector(`.appbar`);if(!e)return;let t=e.getBoundingClientRect().height;t>0&&document.documentElement.style.setProperty(`--appbar-h`,`${Math.round(t)}px`)}function k(){return`
    <div class="appbar">
      <h1>TriliumMobile</h1>
      <span class="status ${y.syncing?`busy`:y.lastOk?`ok`:`bad`}" id="status">${Z(y.syncing?y.progress?.message||`同步中…`:y.pending>0?`${y.pending} 项待同步`:y.lastMessage||`已同步`)}</span>
      <button id="sync" ${y.syncing?`disabled`:``}>${y.syncing?`…`:`同步`}</button>
      <button id="settings" class="ghost" aria-label="设置">⚙</button>
    </div>
  `}function A(){let e=(e,t,n)=>`<button data-tab="${e}" aria-selected="${y.tab===e}">
       <span class="glyph">${t}</span><span>${n}</span>
     </button>`;return`<nav class="tabbar">
    ${e(`capture`,`✎`,`速记`)}
    ${e(`search`,`⌕`,`速查`)}
    ${e(`browse`,`☰`,`浏览`)}
  </nav>`}async function j(){switch(y.tab){case`capture`:return M(await S.counts());case`search`:return N();case`browse`:return P()}}function M(e){return`
    <div class="quick-note">
      <div class="banner">
        离线可用。保存后写入本地，联网时自动同步。
        本地现有 ${e.notes.toLocaleString(`en-US`)} 条笔记。
      </div>
      <div class="field">
        <label for="capture-title">标题（可留空，自动取首行）</label>
        <input id="capture-title" placeholder="标题" autocomplete="off" enterkeyhint="next" />
      </div>
      <textarea id="capture-body" placeholder="随手记点什么…" enterkeyhint="enter"></textarea>
      <div class="capture-actions">
        <span class="hint">⌘/Ctrl + Enter 快速保存</span>
        <button class="primary" id="capture-save" ${y.busy?`disabled`:``}>保存</button>
      </div>
    </div>
  `}async function N(){let e=y.query.trim()?await S.search(y.query):await S.recent(30),t=y.query.trim()?`${e.length} 条结果`:`最近修改（输入以搜索标题与正文）`,n=e.length===0?`<div class="empty">没有匹配的笔记。<br />搜索在本地进行，标题和正文都会命中。</div>`:`<div class="list">${await F(e)}</div>`;return`
    <input id="search-input" type="search" placeholder="搜索…" value="${Q(y.query)}"
           autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" />
    <div class="banner" style="margin-top:12px">${Z(t)}</div>
    ${n}
  `}async function P(){let e=y.browsePath[y.browsePath.length-1]??v,[t,n]=await Promise.all([S.childrenOf(e),S.breadcrumb(e)]);return`<div class="crumbs">${n.map((e,t)=>`<span data-crumb="${t}">${Z(e.title)}</span>`).join(` <span>›</span> `)}</div>${t.length===0?`<div class="empty">这个笔记没有子笔记。</div>`:`<div class="list">${await F(t,!0)}</div>`}`}async function F(t,n=!1){return(await Promise.all(t.map(async t=>{let[r,i]=await Promise.all([S.getNote(t.noteId),n?S.childCount(t.noteId):Promise.resolve(0)]),a=r?e(r.content):``,o=[t.type===`text`?null:t.type,i>0?`${i} 个子笔记`:null,oe(t.utcDateModified)].filter(Boolean).join(` · `);return`
        <button class="row" data-note-id="${t.noteId}" data-is-dir="${n&&i>0}">
          <span class="title">${Z(t.title||`(无标题)`)}</span>
          ${a?`<span class="snippet">${Z(a)}</span>`:``}
          <span class="meta">${Z(o)}</span>
        </button>
      `}))).join(``)}async function I(e){let t=await S.getNote(e);if(!t)return``;y.hasInk=!!(await S.loadInk(e)).attachmentId;let n=t.labels.filter(e=>!e.name.startsWith(`_`)).slice(0,12).map(e=>`<span class="chip">${Z(e.value?`${e.name}=${e.value}`:e.name)}</span>`).join(``),r=await S.listAttachments(e),i=r.filter(e=>e.stubbed),a=t.contentStubbed?1+i.length:i.length,o=t.contentStubbed?`<div class="banner">
         <span>正文超过同步上限，尚未下载到本机。</span>
         <button id="fetch-note-blob">下载正文</button>
       </div>`:``,s=r.length>0?`<div class="attachments">
           ${r.map(e=>`
             <div class="attachment">
               <span class="attachment-title">${Z(e.title)}</span>
               <span class="attachment-meta">${Z(e.mime||e.role)}</span>
               ${e.stubbed?`<button data-fetch-attachment="${e.attachmentId}">下载</button>`:`<span class="attachment-meta">已缓存</span>`}
             </div>`).join(``)}
         </div>`:``,c=t.type===`text`||t.type===`code`,l=_()&&c?L(t):``,u=y.detailMode===`edit`?`body editing`:`body`,d=y.detailMode===`edit`?`<div id="editor" class="editor" contenteditable="true" spellcheck="false">${$(t.content)}</div>`:`${o}${z(t)}`,f=y.detailMode===`ink`||y.hasInk?`<canvas id="ink-layer" class="ink-layer${y.detailMode===`ink`?` active`:``}"></canvas>`:``;return`
    <div class="detail" data-mode="${y.detailMode}">
      <div class="appbar">
        <button id="detail-back" class="ghost" aria-label="返回">‹ 返回</button>
        <h1>${Z(t.title||`(无标题)`)}</h1>
      </div>
      ${l}
      <div class="${u}" id="detail-body">
        ${d}
        ${f}
      </div>
      ${y.detailMode===`ink`?R():``}
      ${n?`<div class="label-chips">${n}</div>`:``}
      ${s}
      ${a>0&&y.detailMode!==`ink`?`<div class="cache-note">本机还有 ${a} 项内容未下载</div>`:``}
    </div>
  `}function L(e){let t=e=>y.detailMode===e?` active`:``,n=y.inkDirty?`笔迹 •`:`笔迹`;return y.detailMode===`edit`?`<div class="detail-toolbar">
      <button id="mode-save" class="primary">保存</button>
      <button id="mode-cancel">取消</button>
    </div>`:`<div class="detail-toolbar">
    <button id="mode-edit" class="${t(`edit`).trim()}">编辑</button>
    <button id="mode-ink" class="${t(`ink`).trim()}">${n}</button>
  </div>`}function R(){return`<div class="ink-toolbar">
    <span class="ink-hint" id="ink-hint">用笔或手指书写</span>
    <button data-ink-color="#e8eaed" class="swatch" style="--swatch:#e8eaed" aria-label="白色"></button>
    <button data-ink-color="#ff6b6b" class="swatch" style="--swatch:#ff6b6b" aria-label="红色"></button>
    <button data-ink-color="#3ddc84" class="swatch" style="--swatch:#3ddc84" aria-label="绿色"></button>
    <button data-ink-color="#6ea8fe" class="swatch" style="--swatch:#6ea8fe" aria-label="蓝色"></button>
    <button id="ink-undo">撤销</button>
    <button id="ink-clear">清空</button>
    <button id="ink-save" class="primary" ${y.inkDirty?``:`disabled`}>保存笔迹</button>
  </div>`}function z(e){return e.content===``?`<div class="empty">（空笔记）</div>`:e.type===`code`?`<pre>${Z(e.content)}</pre>`:e.type===`image`?`<div class="empty">图片笔记（${Z(e.mime)}）——本版本不在移动端渲染二进制内容。</div>`:e.type===`file`?`<div class="empty">附件笔记（${Z(e.mime)}）——需在桌面端打开。</div>`:$(e.content)}function B(){document.querySelectorAll(`[data-tab]`).forEach(e=>{e.addEventListener(`click`,()=>{y.tab=e.dataset.tab,y.openNoteId=null,D()})}),document.getElementById(`sync`)?.addEventListener(`click`,()=>void J()),document.getElementById(`settings`)?.addEventListener(`click`,()=>void ie()),K(),q(),document.querySelectorAll(`[data-crumb]`).forEach(e=>{e.addEventListener(`click`,()=>{y.browsePath=y.browsePath.slice(0,Number(e.dataset.crumb)+1),D()})}),document.getElementById(`detail-back`)?.addEventListener(`click`,()=>{y.openNoteId=null,y.detailMode=`view`,D()}),y.openNoteId&&V(y.openNoteId)}async function V(e){let t=document.getElementById(`ink-layer`);if(t&&y.detailMode===`ink`){let i=await S.loadInk(e);b=new c(t,i.doc?r(i.doc):n(W(t)),{color:H,width:U,onChange:()=>{y.inkDirty=(b?.document.strokes.length??0)>0;let e=document.getElementById(`ink-save`);e&&(e.disabled=!y.inkDirty)}}),requestAnimationFrame(()=>{b?.resize(),G()})}else if(t&&y.hasInk){let n=r((await S.loadInk(e)).doc);requestAnimationFrame(()=>l(t,n))}document.getElementById(`mode-edit`)?.addEventListener(`click`,()=>{y.detailMode=`edit`,D()}),document.getElementById(`mode-ink`)?.addEventListener(`click`,()=>{y.detailMode=y.detailMode===`ink`?`view`:`ink`,D()}),document.getElementById(`mode-cancel`)?.addEventListener(`click`,()=>{y.detailMode=`view`,D()}),document.getElementById(`mode-save`)?.addEventListener(`click`,async()=>{let t=document.getElementById(`editor`);t&&(await S.updateNoteContent(e,t.innerHTML),y.detailMode=`view`,X(`已保存`,!1),await E(),await D())}),document.getElementById(`fetch-note-blob`)?.addEventListener(`click`,async t=>{let n=t.currentTarget;n.disabled=!0,n.textContent=`下载中…`;let r=await S.fetchNoteBlob(e);r.fetched?X(`已下载 ${(r.bytes/1024).toFixed(0)} KB`,!1):X(r.error??`下载失败`,!0),await D()}),document.querySelectorAll(`[data-fetch-attachment]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.dataset.fetchAttachment;if(!t)return;e.textContent=`下载中…`;let n=await S.fetchAttachmentBlob(t);n.fetched?X(`已下载 ${(n.bytes/1024).toFixed(0)} KB`,!1):X(n.error??`下载失败`,!0),await D()})}),document.querySelectorAll(`[data-ink-color]`).forEach(e=>{e.addEventListener(`click`,()=>{H=e.dataset.inkColor??H,b?.setStyle({color:H})})}),document.getElementById(`ink-undo`)?.addEventListener(`click`,()=>{b?.undo(),y.inkDirty=(b?.document.strokes.length??0)>0;let e=document.getElementById(`ink-save`);e&&(e.disabled=!y.inkDirty)}),document.getElementById(`ink-clear`)?.addEventListener(`click`,()=>{b?.clear(),y.inkDirty=(b?.document.strokes.length??0)>0;let e=document.getElementById(`ink-save`);e&&(e.disabled=!y.inkDirty)}),document.getElementById(`ink-save`)?.addEventListener(`click`,async()=>{b&&(await S.saveInk(e,i(b.document)),y.inkDirty=!1,y.hasInk=!0,X(`笔迹已保存，将随笔记同步`,!1),await E(),await D())})}var H=`#e8eaed`,U=.004;function W(e){let t=e.getBoundingClientRect();return t.height>0?t.width/t.height:1}function G(){let e=document.getElementById(`ink-hint`);e&&b&&(e.textContent=b.sawPen?`已识别到手写笔`:`用笔或手指书写`)}function K(){let e=document.getElementById(`capture-title`),t=document.getElementById(`capture-body`);if(!e||!t)return;let n=async()=>{let n=t.value.trim(),r=e.value.trim();if(n===``&&r===``){X(`写点什么再保存`,!0);return}y.busy=!0;try{let e=await S.inboxNoteId(),t=r||ae(n)||`速记`,i=n===``?`<p></p>`:`<p>${Z(n).replace(/\n{2,}/g,`</p><p>`).replace(/\n/g,`<br />`)}</p>`;await S.createTextNote({parentNoteId:e,title:t,content:i}),await E(),X(`已保存到本地，等待同步`,!1)}catch(e){X(e instanceof Error?e.message:String(e),!0)}finally{y.busy=!1,await D(),document.getElementById(`capture-body`)?.focus()}};document.getElementById(`capture-save`)?.addEventListener(`click`,()=>void n()),t.addEventListener(`keydown`,e=>{(e.metaKey||e.ctrlKey)&&e.key===`Enter`&&n()}),requestAnimationFrame(()=>{document.activeElement?.tagName!==`INPUT`&&document.activeElement?.tagName!==`TEXTAREA`&&t.focus()})}function q(){let e=document.getElementById(`search-input`);if(!e)return;let t,n=async()=>{let t=e.selectionStart??e.value.length;await D();let n=document.getElementById(`search-input`);n&&(n.focus(),n.setSelectionRange(t,t))};e.addEventListener(`input`,()=>{y.query=e.value,window.clearTimeout(t),t=window.setTimeout(()=>void n(),140)}),e.addEventListener(`keydown`,t=>{t.key===`Enter`&&(y.query=e.value,D())})}T.addEventListener(`click`,e=>{let t=e.target.closest(`[data-note-id]`);if(!t)return;let n=t.dataset.noteId;t.dataset.isDir===`true`&&y.tab===`browse`?y.browsePath=[...y.browsePath,n]:y.openNoteId=n,D()});async function J(){y.syncing=!0,y.lastMessage=`连接中…`,await D();try{let e=await S.sync();y.lastOk=e.ok,y.lastMessage=e.message,e.ok||X(e.message,!0)}catch(e){y.lastOk=!1,y.lastMessage=e instanceof Error?e.message:String(e),X(y.lastMessage,!0)}finally{y.syncing=!1,y.progress=null,await E(),await D()}}function Y(e){let t=y.serverHost??(p()?``:location.origin);T.innerHTML=`
    <div class="setup">
      <h2>连接 Trilium 服务端</h2>
      <p>
        填入你自建服务端的地址与密码。密码只用于读取同步密钥，之后同步走的是
        documentSecret 的 HMAC，不会再发送密码。
      </p>
      ${e?`<div class="banner bad">${Z(e)}</div>`:``}
      <div class="field">
        <label for="server">服务端地址</label>
        <input id="server" type="url" inputmode="url" autocapitalize="off" autocorrect="off"
               spellcheck="false" placeholder="http://192.168.1.10:8080" value="${Q(t)}" />
      </div>
      <div class="field">
        <label for="password">密码</label>
        <input id="password" type="password" autocomplete="current-password" />
      </div>
      <button class="primary" id="connect" ${y.busy?`disabled`:``}>
        ${y.busy?`连接中…`:`连接并首次同步`}
      </button>
      <p>
        首次同步会拉取整个笔记树。二进制附件超过 4 MiB 的部分不会下载，点开时再按需获取。
      </p>
      <p class="note">
        ⚠️ 地址必须与当前页面<b>同源</b>。Trilium 服务端返回
        <code>Cross-Origin-Resource-Policy: same-origin</code> 且不带 CORS 头，浏览器会直接拒绝
        跨源读取。开发时由 Vite 代理 <code>/api</code> 转发到真实服务端；正式环境请把本应用
        部署在服务端同源之下（或由原生外壳代为转发请求）。
      </p>
    </div>
  `,document.getElementById(`connect`)?.addEventListener(`click`,async()=>{let e=document.getElementById(`server`).value.trim(),t=document.getElementById(`password`).value;if(!e||!t){Y(`请填写服务端地址和密码`);return}y.busy=!0,Y(``);try{await S.configure(e,t),y.busy=!1,await E(),await D(),await J()}catch(e){y.busy=!1,await E(),Y(e instanceof Error?e.message:String(e))}})}async function ie(){let[e,t]=await Promise.all([S.counts(),S.maxBlobContentSize()]);y.openNoteId=null,T.innerHTML=`
    <div class="appbar">
      <button id="settings-back" class="ghost">‹ 返回</button>
      <h1>设置</h1>
    </div>
    <div class="view">
      <div class="banner">
        服务端：${Z(y.serverHost||`(未配置)`)}<br />
        本地：${e.notes.toLocaleString(`en-US`)} 条笔记 ·
        ${e.branches.toLocaleString(`en-US`)} 个分支 ·
        ${e.attributes.toLocaleString(`en-US`)} 个属性 ·
        ${e.blobs.toLocaleString(`en-US`)} 个内容块
      </div>
      <div class="field">
        <label for="blob-cap">附件同步上限（字节，0 = 不限制）</label>
        <input id="blob-cap" type="number" inputmode="numeric" value="${t}" />
      </div>
      <button id="save-settings" class="primary">保存</button>
      <button id="reconfigure" style="margin-top:10px">重新配置服务端</button>
    </div>
  `,document.getElementById(`settings-back`)?.addEventListener(`click`,()=>void D()),document.getElementById(`save-settings`)?.addEventListener(`click`,async()=>{let e=Number(document.getElementById(`blob-cap`).value);await S.setMaxBlobContentSize(Number.isFinite(e)&&e>=0?e:4194304),X(`已保存`,!1),await D()}),document.getElementById(`reconfigure`)?.addEventListener(`click`,async()=>{await S.reset(),await E(),Y()})}function X(e,t){y.toast={text:e,bad:t},window.setTimeout(()=>{y.toast=null,D()},2400)}function ae(e){return e.split(`
`).map(e=>e.trim()).find(e=>e.length>0)??``}function oe(e){let t=e?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);if(!t)return``;let[,n,r,i,a,o]=t,s=Date.UTC(Number(n),Number(r)-1,Number(i),Number(a),Number(o)),c=(Date.now()-s)/6e4;return c<1?`刚刚`:c<60?`${Math.floor(c)} 分钟前`:c<1440?`${Math.floor(c/60)} 小时前`:c<10080?`${Math.floor(c/1440)} 天前`:`${n}-${r}-${i}`}function Z(e){return e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function Q(e){return Z(e)}function $(e){let t=document.createElement(`template`);t.innerHTML=e;let n=new Set(`P.BR.B.STRONG.I.EM.U.S.DEL.CODE.PRE.BLOCKQUOTE.UL.OL.LI.H1.H2.H3.H4.H5.H6.HR.SPAN.DIV.TABLE.THEAD.TBODY.TR.TD.TH.FIGURE.FIGCAPTION.A.IMG.MARK.SUB.SUP.SMALL`.split(`.`));for(let e of Array.from(t.content.querySelectorAll(`*`))){if(!n.has(e.tagName)){e.replaceWith(...Array.from(e.childNodes));continue}for(let t of Array.from(e.attributes)){let n=t.name.toLowerCase(),r=t.value;if(!(n===`href`||n===`title`||n===`alt`||n===`src`||n===`colspan`||n===`rowspan`||n.startsWith(`data-`)||n===`class`&&/^(language-|trilium-)/.test(r))){e.removeAttribute(t.name);continue}(n===`href`||n===`src`)&&/^\s*(javascript|data|vbscript):/i.test(r)&&e.removeAttribute(t.name)}e.tagName===`A`&&(e.setAttribute(`target`,`_blank`),e.setAttribute(`rel`,`noopener noreferrer`))}return t.innerHTML}ne();