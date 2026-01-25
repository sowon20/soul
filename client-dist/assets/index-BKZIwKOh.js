(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))s(n);new MutationObserver(n=>{for(const a of n)if(a.type==="childList")for(const i of a.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&s(i)}).observe(document,{childList:!0,subtree:!0});function t(n){const a={};return n.integrity&&(a.integrity=n.integrity),n.referrerPolicy&&(a.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?a.credentials="include":n.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function s(n){if(n.ep)return;n.ep=!0;const a=t(n);fetch(n.href,a)}})();const T="modulepreload",$=function(m){return"/"+m},C={},M=function(e,t,s){let n=Promise.resolve();if(t&&t.length>0){document.getElementsByTagName("link");const i=document.querySelector("meta[property=csp-nonce]"),o=(i==null?void 0:i.nonce)||(i==null?void 0:i.getAttribute("nonce"));n=Promise.allSettled(t.map(r=>{if(r=$(r),r in C)return;C[r]=!0;const d=r.endsWith(".css"),l=d?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${r}"]${l}`))return;const c=document.createElement("link");if(c.rel=d?"stylesheet":T,d||(c.as="script"),c.crossOrigin="",c.href=r,o&&c.setAttribute("nonce",o),document.head.appendChild(c),d)return new Promise((u,p)=>{c.addEventListener("load",u),c.addEventListener("error",()=>p(new Error(`Unable to preload CSS for ${r}`)))})}))}function a(i){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=i,window.dispatchEvent(o),!o.defaultPrevented)throw i}return n.then(i=>{for(const o of i||[])o.status==="rejected"&&a(o.reason);return e().catch(a)})};class B{constructor(){this.root=document.documentElement,this.currentTheme="default",this.currentFontSize="md",this.userId=null,this.loadSettings()}setUserId(e){this.userId=e}async applyTheme(e){this.currentTheme=e,this.root.setAttribute("data-theme",e),e==="dark"?this.root.classList.add("dark"):this.root.classList.remove("dark"),this.saveToLocalStorage("theme",e),this.userId&&await this.saveToServer({skin:e}),console.log(`✨ 테마 적용: ${e}`)}async setFontSize(e){this.currentFontSize=e,this.root.setAttribute("data-font-size",e),this.saveToLocalStorage("fontSize",e),this.userId&&await this.saveToServer({fontSize:e}),console.log(`📏 글씨 크기 변경: ${e}`)}async setGlassIntensity(e){const t={low:{opacity:.95,blur:10},medium:{opacity:.85,blur:20},high:{opacity:.75,blur:30}},s=t[e]||t.medium;this.setCSSVariable("--glass-opacity",s.opacity),this.setCSSVariable("--glass-blur",`${s.blur}px`),this.saveToLocalStorage("glassIntensity",e),this.userId&&await this.saveToServer({glassOpacity:s.opacity*100,glassBlur:s.blur}),console.log(`✨ 유리 효과 강도: ${e} (opacity: ${s.opacity}, blur: ${s.blur}px)`)}async setGlassEffect(e,t={}){this.root.setAttribute("data-glass",e.toString()),this.setCSSVariable("--glass-enabled",e),t.opacity!==void 0&&this.setCSSVariable("--glass-opacity",t.opacity/100),t.blur!==void 0&&this.setCSSVariable("--glass-blur",`${t.blur}px`),this.saveToLocalStorage("glassEnabled",e),this.userId&&await this.saveToServer({glassEnabled:e}),console.log(`✨ 유리 효과: ${e?"활성화":"비활성화"}`,t)}async setBackgroundImage(e,t={}){if(e){this.setCSSVariable("--background-image",`url('${e}')`);const s=t.opacity!==void 0?t.opacity/100:.3,n=t.blur!==void 0?`${t.blur}px`:"5px",a=t.position||"center",i=t.size||"cover";this.setCSSVariable("--background-image-opacity",s),this.setCSSVariable("--background-image-blur",n),this.setCSSVariable("--background-image-position",a),this.setCSSVariable("--background-image-size",i),this.saveToLocalStorage("backgroundImage",e),this.userId&&await this.saveToServer({backgroundImage:e,backgroundOpacity:s*100,backgroundBlur:parseInt(n)}),console.log("🖼️ 배경 이미지 설정:",e,{opacity:s,blur:n,position:a,size:i})}else this.removeBackgroundImage()}async removeBackgroundImage(){this.setCSSVariable("--background-image","none"),this.setCSSVariable("--background-image-opacity",0),this.saveToLocalStorage("backgroundImage",""),this.userId&&await this.saveToServer({backgroundImage:null}),console.log("🗑️ 배경 이미지 제거")}setCustomColor(e,t){this.setCSSVariable(e,t)}setCSSVariable(e,t){this.root.style.setProperty(e,t)}getCSSVariable(e){return getComputedStyle(this.root).getPropertyValue(e).trim()}getCurrentSettings(){return{theme:this.currentTheme,fontSize:this.currentFontSize,glassEnabled:this.getCSSVariable("--glass-enabled")==="true",glassOpacity:parseFloat(this.getCSSVariable("--glass-opacity"))*100,glassBlur:parseInt(this.getCSSVariable("--glass-blur"))}}async saveToServer(e){if(!this.userId){console.warn("사용자 ID가 설정되지 않아 서버 저장을 건너뜁니다.");return}try{const t=new AbortController,s=setTimeout(()=>t.abort(),1e3),n=await fetch(`/api/profile/user/${this.userId}/theme`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(e),signal:t.signal});if(clearTimeout(s),!n.ok)throw new Error("테마 설정 저장 실패");return console.log("💾 서버에 테마 설정 저장 완료:",e),await n.json()}catch(t){t.name==="AbortError"?console.warn("서버 저장 타임아웃 (로컬 저장은 유지)"):console.error("서버 저장 오류 (로컬 저장은 유지):",t)}}async saveSettings(e,t){try{const s=await fetch(`/api/profile/user/${e}/theme`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!s.ok)throw new Error("테마 설정 저장 실패");return console.log("💾 테마 설정 저장 완료"),await s.json()}catch(s){throw console.error("테마 설정 저장 오류:",s),s}}toggleDarkMode(){this.currentTheme==="dark"?this.applyTheme("default"):this.applyTheme("dark")}saveToLocalStorage(e,t){try{localStorage.setItem(`soul_${e}`,JSON.stringify(t))}catch(s){console.error("localStorage 저장 실패:",s)}}getFromLocalStorage(e,t){try{const s=localStorage.getItem(`soul_${e}`);return s?JSON.parse(s):t}catch(s){return console.error("localStorage 불러오기 실패:",s),t}}loadSettings(){const e=this.getFromLocalStorage("theme","default");this.currentTheme=e,this.root.setAttribute("data-theme",e),e==="dark"&&this.root.classList.add("dark");const t=this.getFromLocalStorage("fontSize","md");this.currentFontSize=t,this.root.setAttribute("data-font-size",t);const s=this.getFromLocalStorage("glassIntensity","medium"),n={low:{opacity:.95,blur:10},medium:{opacity:.85,blur:20},high:{opacity:.75,blur:30}},a=n[s]||n.medium;this.setCSSVariable("--glass-opacity",a.opacity),this.setCSSVariable("--glass-blur",`${a.blur}px`);const i=this.getFromLocalStorage("glassEnabled",!0);this.root.setAttribute("data-glass",i.toString()),this.setCSSVariable("--glass-enabled",i);const o=this.getFromLocalStorage("backgroundImage","");o&&this.setCSSVariable("--background-image",`url('${o}')`),console.log("📂 저장된 설정 불러오기 완료:",{theme:e,fontSize:t,glassIntensity:s,glassEnabled:i,backgroundImage:o})}}class P{constructor(){this.initialized=!1,this.currentPeriod="today",this.customStartDate=null,this.customEndDate=null}async init(){if(!this.initialized)try{this.setupPeriodTabs(),this.setupDateRange(),await this.loadRoutingStats(),this.initialized=!0,console.log("Dashboard initialized")}catch(e){console.error("Dashboard initialization failed:",e)}}setupPeriodTabs(){const e=document.querySelectorAll(".stats-period-tab"),t=document.getElementById("statsDateRange");e.forEach(s=>{s.addEventListener("click",async n=>{e.forEach(i=>i.classList.remove("active")),n.target.classList.add("active");const a=n.target.dataset.period;this.currentPeriod=a,t&&(t.style.display=a==="custom"?"flex":"none"),a!=="custom"&&await this.loadRoutingStats()})})}setupDateRange(){const e=document.getElementById("statsStartDate"),t=document.getElementById("statsEndDate"),s=document.getElementById("statsDateApply");if(!e||!t||!s)return;const n=new Date().toISOString().split("T")[0],a=new Date(Date.now()-7*24*60*60*1e3).toISOString().split("T")[0];e.value=a,t.value=n,s.addEventListener("click",async()=>{this.customStartDate=e.value,this.customEndDate=t.value,await this.loadRoutingStats()})}async loadRoutingStats(){var e,t,s;try{let n=`/api/chat/routing-stats?period=${this.currentPeriod}`;this.currentPeriod==="custom"&&this.customStartDate&&this.customEndDate&&(n+=`&startDate=${this.customStartDate}&endDate=${this.customEndDate}`);const i=await(await fetch(n)).json();if(i.success&&i.stats){const o=i.stats;this.updateStat("stat-requests",this.formatNumber(o.totalRequests||0)),this.updateStat("stat-light",((e=o.distribution)==null?void 0:e.light)||"0%"),this.updateStat("stat-medium",((t=o.distribution)==null?void 0:t.medium)||"0%"),this.updateStat("stat-heavy",((s=o.distribution)==null?void 0:s.heavy)||"0%");const r=o.totalCost||0;this.updateStat("stat-cost","$"+r.toFixed(4));const d=o.averageLatency;this.updateStat("stat-latency",d?d.toFixed(0)+"ms":"-"),this.renderModelUsage(o.modelUsage||[])}}catch(n){console.error("Failed to load routing stats:",n),this.setDefaultStats()}}renderModelUsage(e){const t=document.getElementById("model-usage-list");if(!t)return;if(e.length===0){t.innerHTML='<div class="no-data">아직 사용 기록이 없습니다</div>';return}const s=e.slice(0,5);t.innerHTML=s.map(n=>{const a=this.getModelDisplayName(n.modelId),i=parseFloat(n.percentage)||0;return`
        <div class="model-usage-item">
          <div class="model-usage-header">
            <span class="model-name">${a}</span>
            <span class="model-percentage">${n.percentage}</span>
          </div>
          <div class="model-usage-bar">
            <div class="model-usage-fill" style="width: ${i}%"></div>
          </div>
          <div class="model-usage-details">
            <span>${n.count}회</span>
            <span>${n.avgLatency?n.avgLatency.toFixed(0)+"ms":"-"}</span>
          </div>
        </div>
      `}).join("")}getModelDisplayName(e){if(!e)return"Unknown";const t=e.toLowerCase();return t.includes("claude")?t.includes("opus")?"Claude Opus":t.includes("sonnet")?"Claude Sonnet":t.includes("haiku")?"Claude Haiku":"Claude":t.includes("gpt")?t.includes("4o")?"GPT-4o":t.includes("4")?"GPT-4":t.includes("3.5")?"GPT-3.5":"GPT":t.includes("gemini")?t.includes("ultra")?"Gemini Ultra":t.includes("pro")?"Gemini Pro":t.includes("flash")?"Gemini Flash":"Gemini":t.includes("grok")?t.includes("mini")?"Grok Mini":"Grok":e.length>20?e.substring(0,20)+"...":e}setDefaultStats(){this.updateStat("stat-requests","0"),this.updateStat("stat-light","0%"),this.updateStat("stat-medium","0%"),this.updateStat("stat-heavy","0%"),this.updateStat("stat-cost","$0.00"),this.updateStat("stat-latency","-");const e=document.getElementById("model-usage-list");e&&(e.innerHTML='<div class="no-data">아직 사용 기록이 없습니다</div>')}updateStat(e,t){const s=document.getElementById(e);s&&(s.textContent=t)}formatNumber(e){return e>=1e6?(e/1e6).toFixed(1)+"M":e>=1e3?(e/1e3).toFixed(1)+"K":e.toString()}async refresh(){await this.loadRoutingStats()}async setPeriod(e){this.currentPeriod=e,await this.loadRoutingStats()}}const k=new P;class z{constructor(e){this.apiClient=e,this.messagesArea=document.getElementById("messagesArea"),this.userMessageTemplate=document.getElementById("userMessageTemplate"),this.assistantMessageTemplate=document.getElementById("assistantMessageTemplate"),this.typingIndicatorTemplate=document.getElementById("typingIndicatorTemplate"),this.messages=[],this.conversationId="main-conversation",this.isLoadingHistory=!1,this.hasMoreHistory=!0,this.oldestMessageId=null,window.marked&&window.marked.setOptions({breaks:!0,gfm:!0}),this.setupInfiniteScroll(),this.setupSelectionRestriction()}setupSelectionRestriction(){let e=null,t=!1;this.messagesArea.addEventListener("mousedown",s=>{var a;const n=s.target.closest(".message-content");e=n?n.closest(".chat-message"):null,console.log("🖱️ mousedown on message:",(a=e==null?void 0:e.classList)==null?void 0:a.value)}),document.addEventListener("selectionchange",()=>{if(!e||t)return;const s=document.getSelection();if(!s||s.rangeCount===0)return;const n=s.getRangeAt(0);if(n.collapsed)return;const a=d=>{var c;const l=d.nodeType===Node.TEXT_NODE?d.parentElement:d;return(c=l==null?void 0:l.closest)==null?void 0:c.call(l,".chat-message")},i=a(n.startContainer),o=a(n.endContainer);i&&o&&i.closest(".chat-messages")&&o.closest(".chat-messages")||(console.log("❌ Selection outside message area, clearing"),t=!0,s.removeAllRanges(),setTimeout(()=>{t=!1},0))}),document.addEventListener("mouseup",()=>{e=null})}setupInfiniteScroll(){this.messagesArea.addEventListener("scroll",()=>{this.messagesArea.scrollTop<100&&!this.isLoadingHistory&&this.hasMoreHistory&&this.loadOlderMessages()})}async loadOlderMessages(){if(this.isLoadingHistory||!this.hasMoreHistory)return;this.isLoadingHistory=!0;const e=this.messagesArea.scrollHeight;try{const t={limit:20};this.oldestMessageId&&(t.before=this.oldestMessageId);const s=await this.apiClient.getConversationHistory(this.conversationId,t);if(s&&s.messages&&s.messages.length>0){this.messages.unshift(...s.messages),this.oldestMessageId=s.messages[0].id||s.messages[0].timestamp,s.messages.reverse().forEach(a=>{const i=this.createMessageElement(a);this.messagesArea.insertBefore(i,this.messagesArea.firstChild)});const n=this.messagesArea.scrollHeight;this.messagesArea.scrollTop=n-e,s.messages.length<t.limit&&(this.hasMoreHistory=!1)}else this.hasMoreHistory=!1}catch(t){console.error("과거 메시지 로드 실패:",t),this.hasMoreHistory=!1}finally{this.isLoadingHistory=!1}}async loadRecentMessages(e=50){try{const t=await this.apiClient.getConversationHistory(this.conversationId,{limit:e});t&&t.messages&&t.messages.length>0&&(this.messages=t.messages,this.oldestMessageId=t.messages[0].id||t.messages[0].timestamp,t.messages.forEach(s=>{const n=this.createMessageElement(s);this.messagesArea.appendChild(n)}),this.scrollToBottom(!1)),this.messagesArea.classList.add("loaded")}catch(t){console.error("최근 메시지 로드 실패:",t),this.messagesArea.classList.add("loaded"),this.addWelcomeMessage()}}addWelcomeMessage(){this.addMessage({role:"assistant",content:"안녕하세요! 무엇을 도와드릴까요?",timestamp:new Date})}addMessage(e){this.messages.push(e);const t=this.createMessageElement(e);t.classList.add("fade-in-up"),this.messagesArea.appendChild(t),this.scrollToBottom()}createMessageElement(e){let t;if(e.role==="user"){t=this.userMessageTemplate.content.cloneNode(!0);const s=t.querySelector(".chat-message.user"),n=s.querySelector(".message-content");n.textContent=e.content;const a=s.querySelector(".message-time");return a.textContent=this.formatDateTime(e.timestamp),this.attachUserMessageActions(s,e),s}else{t=this.assistantMessageTemplate.content.cloneNode(!0);const s=t.querySelector(".chat-message.assistant"),n=s.querySelector(".message-content"),a=window.marked?window.marked.parse(e.content):this.escapeHtml(e.content);return n.innerHTML=a,this.processCodeBlocks(n,e.content),this.processExternalLinks(n),this.attachAssistantMessageActions(s,e),s}}processCodeBlocks(e,t){e.querySelectorAll("pre").forEach(n=>{const a=document.createElement("div");a.className="code-block";const i=document.createElement("button");i.className="code-copy-btn",i.title="복사",i.innerHTML=`
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      `;const o=n.querySelector("code"),r=o?o.textContent:n.textContent;i.addEventListener("click",()=>{this.copyMessage(r,i)}),n.parentNode.insertBefore(a,n),a.appendChild(i),a.appendChild(n),window.Prism&&o&&window.Prism.highlightElement(o)})}processExternalLinks(e){e.querySelectorAll("a").forEach(s=>{const n=s.getAttribute("href");if(!n)return;(n.startsWith("http://")||n.startsWith("https://"))&&s.addEventListener("click",i=>{i.preventDefault(),this.showExternalLinkModal(n)})})}showExternalLinkModal(e){const t=document.getElementById("externalLinkModal"),s=document.getElementById("externalLinkUrl"),n=document.getElementById("externalLinkCancel"),a=document.getElementById("externalLinkConfirm"),i=t.querySelector(".external-link-backdrop");if(!t||!s)return;s.textContent=e,t.classList.add("show");const o=()=>{t.classList.remove("show"),n.removeEventListener("click",o),a.removeEventListener("click",r),i.removeEventListener("click",o)},r=()=>{window.open(e,"_blank","noopener,noreferrer"),o()};n.addEventListener("click",o),a.addEventListener("click",r),i.addEventListener("click",o);const d=l=>{l.key==="Escape"&&(o(),document.removeEventListener("keydown",d))};document.addEventListener("keydown",d)}attachUserMessageActions(e,t){const s=e.querySelector(".copy-btn"),n=e.querySelector(".edit-btn"),a=e.querySelector(".delete-btn");s&&!s.dataset.bound&&(s.dataset.bound="true",s.addEventListener("click",()=>this.copyMessage(t.content,s))),n&&!n.dataset.bound&&(n.dataset.bound="true",n.addEventListener("click",()=>this.editMessage(t))),a&&!a.dataset.bound&&(a.dataset.bound="true",a.addEventListener("click",()=>this.deleteMessage(e,t)))}attachAssistantMessageActions(e,t){const s=e.querySelector(".copy-btn"),n=e.querySelector(".like-btn"),a=e.querySelector(".dislike-btn"),i=e.querySelector(".bookmark-btn"),o=e.querySelector(".retry-btn");s&&!s.dataset.bound&&(s.dataset.bound="true",s.addEventListener("click",()=>this.copyMessage(t.content,s))),n&&!n.dataset.bound&&(n.dataset.bound="true",n.addEventListener("click",()=>this.showFeedback(n,"liked"))),a&&!a.dataset.bound&&(a.dataset.bound="true",a.addEventListener("click",()=>this.showFeedback(a,"disliked"))),i&&!i.dataset.bound&&(i.dataset.bound="true",i.addEventListener("click",()=>this.showFeedback(i,"bookmarked"))),o&&!o.dataset.bound&&(o.dataset.bound="true",o.addEventListener("click",()=>this.retryMessage(t)))}async copyMessage(e,t=null){console.log("📋 copyMessage 호출됨, content:",e==null?void 0:e.substring(0,50));let s=!1;try{navigator.clipboard&&window.isSecureContext?(await navigator.clipboard.writeText(e),s=!0):s=this.copyWithExecCommand(e)}catch(n){console.warn("클립보드 API 실패, 폴백 시도:",n),s=this.copyWithExecCommand(e)}if(t){const n=t.innerHTML;s?(t.innerHTML=`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `,t.classList.add("copied"),console.log("✅ 복사 성공")):(t.innerHTML=`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        `,t.classList.add("copy-failed"),console.log("❌ 복사 실패")),console.log("⏰ setTimeout 설정 (2초 후 복원)"),setTimeout(()=>{console.log("⏰ setTimeout 실행됨 - 원래 아이콘 복원"),t.innerHTML=n,t.classList.remove("copied","copy-failed")},2e3)}}copyWithExecCommand(e){try{const t=document.createElement("textarea");t.value=e,t.style.position="fixed",t.style.left="-9999px",t.style.top="-9999px",document.body.appendChild(t),t.focus(),t.select();const s=document.execCommand("copy");return document.body.removeChild(t),s}catch(t){return console.error("execCommand 복사 실패:",t),!1}}bindExistingMessages(){this.messagesArea.querySelectorAll(".chat-message.assistant").forEach(s=>{const n=s.querySelector(".message-content");if(!n)return;s.querySelectorAll(".code-copy-btn").forEach(u=>{if(u.dataset.bound)return;u.dataset.bound="true";const p=u.closest(".code-block");if(p){const g=p.querySelector("code"),h=g?g.textContent:"";u.addEventListener("click",()=>this.copyMessage(h,u))}}),this.processExternalLinks(n);const i=s.querySelector('.message-actions .message-action-btn[title="복사"]'),o=s.querySelector('.message-actions .message-action-btn[title="좋아요"]'),r=s.querySelector('.message-actions .message-action-btn[title="싫어요"]'),d=s.querySelector('.message-actions .message-action-btn[title="북마크"]'),l=s.querySelector('.message-actions .message-action-btn[title="재생성"]');console.log("🔍 bindExistingMessages - assistant 메시지:",{copyBtn:!!i,likeBtn:!!o,dislikeBtn:!!r,bookmarkBtn:!!d,retryBtn:!!l});const c=n.textContent;i&&!i.dataset.bound&&(i.dataset.bound="true",console.log("✅ copyBtn 바인딩됨"),i.addEventListener("click",u=>{console.log("🖱️ copyBtn 클릭 이벤트 발생"),u.stopPropagation(),this.copyMessage(c,i)})),o&&!o.dataset.bound&&(o.dataset.bound="true",o.addEventListener("click",()=>this.showFeedback(o,"liked"))),r&&!r.dataset.bound&&(r.dataset.bound="true",r.addEventListener("click",()=>this.showFeedback(r,"disliked"))),d&&!d.dataset.bound&&(d.dataset.bound="true",d.addEventListener("click",()=>this.showFeedback(d,"bookmarked"))),l&&!l.dataset.bound&&(l.dataset.bound="true",l.addEventListener("click",()=>console.log("재생성 요청")))}),this.messagesArea.querySelectorAll(".chat-message.user").forEach(s=>{const n=s.querySelector(".message-content");if(!n)return;const a=s.querySelector(".user-message-footer");if(!a)return;const i=a.querySelector('.message-action-btn[title="복사"]'),o=a.querySelector('.message-action-btn[title="수정"]'),r=a.querySelector('.message-action-btn[title="삭제"]'),d=a.querySelector('.message-action-btn[title="재시도"]');console.log("🔍 bindExistingMessages - user 메시지:",{copyBtn:!!i,editBtn:!!o,deleteBtn:!!r,retryBtn:!!d});const l=n.textContent;i&&!i.dataset.bound&&(i.dataset.bound="true",console.log("✅ user copyBtn 바인딩됨"),i.addEventListener("click",c=>{console.log("🖱️ user copyBtn 클릭 이벤트 발생"),c.stopPropagation(),this.copyMessage(l,i)})),o&&!o.dataset.bound&&(o.dataset.bound="true",o.addEventListener("click",()=>alert("수정 기능은 준비 중입니다."))),r&&!r.dataset.bound&&(r.dataset.bound="true",r.addEventListener("click",()=>{confirm("이 메시지를 삭제하시겠습니까?")&&s.remove()})),d&&!d.dataset.bound&&(d.dataset.bound="true",d.addEventListener("click",()=>{this.sendMessage(l)}))})}showFeedback(e,t){e.classList.toggle(t),console.log(`${t} 토글됨`)}editMessage(e){const t=prompt("메시지를 수정하세요:",e.content);t&&t!==e.content&&console.log("메시지 수정:",t)}deleteMessage(e,t){if(confirm("이 메시지를 삭제하시겠습니까?")){e.remove();const s=this.messages.indexOf(t);s>-1&&this.messages.splice(s,1),console.log("메시지 삭제됨")}}likeMessage(e){console.log("메시지 좋아요:",e.content.substring(0,20))}dislikeMessage(e){console.log("메시지 싫어요:",e.content.substring(0,20))}bookmarkMessage(e){console.log("메시지 북마크:",e.content.substring(0,20))}async retryMessage(e){const t=this.messages.indexOf(e);if(t>0){const s=this.messages[t-1];s.role==="user"&&await this.sendMessage(s.content)}}showTypingIndicator(){if(console.log("[Chat] showTypingIndicator called at",Date.now()),console.log("[Chat] typingIndicatorTemplate:",this.typingIndicatorTemplate),!this.typingIndicatorTemplate){console.error("[Chat] typingIndicatorTemplate not found!");return}const t=this.typingIndicatorTemplate.content.cloneNode(!0).querySelector(".chat-message.assistant");console.log("[Chat] indicatorElement:",t),t?(t.id="activeTypingIndicator",this.messagesArea.appendChild(t),this.scrollToBottom(),console.log("[Chat] Typing indicator added to DOM")):console.error("[Chat] Could not find .chat-message.assistant in template")}hideTypingIndicator(){console.log("[Chat] hideTypingIndicator called at",Date.now());const e=document.getElementById("activeTypingIndicator");console.log("[Chat] indicator to remove:",e),e&&(e.remove(),console.log("[Chat] Typing indicator removed"))}async sendMessage(e){this.addMessage({role:"user",content:e,timestamp:new Date}),this.showTypingIndicator();try{const t=await this.apiClient.sendMessage(e);console.log("[Chat] API response:",t),this.hideTypingIndicator();const s=t.reply||t.message||"응답을 받지 못했습니다.";console.log("[Chat] Adding assistant message:",s),this.addMessage({role:"assistant",content:s,timestamp:new Date(t.timestamp||Date.now())}),k.refresh()}catch(t){this.hideTypingIndicator();let s;const n=t.message||"";n.includes("timeout")||n.includes("Request timeout")?s="⏱️ 응답 시간이 너무 오래 걸렸어요. 다시 시도해주세요.":n.includes("Failed to fetch")||n.includes("NetworkError")?s="🌐 네트워크 연결에 문제가 있어요. 인터넷 연결을 확인해주세요.":n.includes("500")||n.includes("502")||n.includes("503")?s="🔧 서버에 일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.":s="😅 메시지 전송 중 문제가 발생했어요. 다시 시도해주세요.",this.addMessage({role:"assistant",content:s,timestamp:new Date}),console.error("메시지 전송 실패:",t)}}clearMessages(){this.messages=[],this.messagesArea.innerHTML=""}scrollToBottom(e=!0){requestAnimationFrame(()=>{const t=this.messagesArea.closest(".right-card-top")||this.messagesArea.parentElement;t.scrollTo({top:t.scrollHeight,behavior:e?"smooth":"auto"})})}formatTime(e){const t=new Date(e),s=t.getHours().toString().padStart(2,"0"),n=t.getMinutes().toString().padStart(2,"0");return`${s}:${n}`}formatDateTime(e){const t=new Date(e),s=(t.getMonth()+1).toString().padStart(2,"0"),n=t.getDate().toString().padStart(2,"0"),a=t.getHours().toString().padStart(2,"0"),i=t.getMinutes().toString().padStart(2,"0");return`${s}/${n} ${a}:${i}`}escapeHtml(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML.replace(/\n/g,"<br>")}formatRelativeTime(e){const t=new Date(e),n=new Date-t,a=Math.floor(n/1e3),i=Math.floor(a/60),o=Math.floor(i/60),r=Math.floor(o/24);return r>0?`${r}일 전`:o>0?`${o}시간 전`:i>0?`${i}분 전`:"방금 전"}searchMessages(e){const t=e.toLowerCase();return this.messages.filter(s=>s.content.toLowerCase().includes(t))}exportToText(){return this.messages.map(e=>{const t=this.formatTime(e.timestamp),s=e.role==="user"?"나":"Soul";return`[${t}] ${s}: ${e.content}`}).join(`

`)}exportToJSON(){return JSON.stringify(this.messages,null,2)}getMessageCount(){return this.messages.length}getLastMessage(){return this.messages[this.messages.length-1]||null}}class A{constructor(e){this.apiClient=e,this.userId="sowon",this.profile=null,this.draggedElement=null}async renderProfilePanel(e){var t;try{const n=await(await fetch(`/api/profile/p?userId=${this.userId}`)).json();if(!n.success)throw new Error(n.error||"프로필 로드 실패");this.profile=n.profile,e.innerHTML=`
        <div class="profile-panel">
          <!-- 프로필 사진 -->
          <div class="profile-section profile-image-section">
            <div class="profile-image-container">
              <div class="profile-image-wrapper" id="profileImageWrapper">
                ${this.profile.profileImage?`<img src="${this.profile.profileImage}" alt="프로필 사진" class="profile-image-preview">`:`<div class="profile-image-placeholder">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                         <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                         <circle cx="12" cy="7" r="4"/>
                       </svg>
                     </div>`}
                <div class="profile-image-overlay">
                  <label for="profileImageInput" class="profile-image-upload-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </label>
                  ${this.profile.profileImage?`
                    <button class="profile-image-delete-btn" id="deleteProfileImageBtn" title="사진 삭제">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  `:""}
                </div>
              </div>
              <input type="file" id="profileImageInput" accept="image/*" style="display: none;">
              <div class="profile-image-info">
                <span class="profile-image-name">${((t=this.profile.basicInfo.name)==null?void 0:t.value)||"소원"}</span>
              </div>
            </div>
          </div>

          <!-- 기본 정보 -->
          <div class="profile-section">
            <h3 class="profile-section-title">기본 정보</h3>
            <div class="profile-basic-info">
              ${this.renderBasicInfoFields()}
            </div>
          </div>

          <!-- 커스텀 필드 -->
          <div class="profile-section">
            <div class="profile-section-header">
              <h3 class="profile-section-title">추가 정보</h3>
              <button class="profile-btn profile-btn-add" id="addFieldBtn">
                <span>+</span> 필드 추가
              </button>
            </div>
            <div class="profile-custom-fields" id="customFieldsContainer">
              ${this.renderCustomFields()}
            </div>
          </div>

          <!-- 권한 설정 -->
          <div class="profile-section">
            <h3 class="profile-section-title">소울 권한 설정</h3>
            <div class="profile-permissions">
              <div class="profile-field">
                <label>읽기 범위</label>
                <select class="profile-input" id="readScope">
                  <option value="full" ${this.profile.permissions.readScope==="full"?"selected":""}>전체 (Full)</option>
                  <option value="limited" ${this.profile.permissions.readScope==="limited"?"selected":""}>제한적 (Limited)</option>
                  <option value="minimal" ${this.profile.permissions.readScope==="minimal"?"selected":""}>최소 (Minimal)</option>
                </select>
                <small>소울이 프로필을 읽을 수 있는 범위입니다.</small>
              </div>
              <div class="profile-field">
                <label>
                  <input type="checkbox" id="canWrite" ${this.profile.permissions.canWrite?"checked":""}>
                  쓰기 권한 허용
                </label>
                <small>소울이 프로필을 수정할 수 있습니다.</small>
              </div>
              <div class="profile-field">
                <label>
                  <input type="checkbox" id="canDelete" ${this.profile.permissions.canDelete?"checked":""}>
                  삭제 권한 허용
                </label>
                <small>소울이 필드를 삭제할 수 있습니다.</small>
              </div>
              <div class="profile-field">
                <label>
                  <input type="checkbox" id="autoIncludeInContext" ${this.profile.permissions.autoIncludeInContext?"checked":""}>
                  자동으로 컨텍스트에 포함
                </label>
                <small>대화 시작 시 자동으로 프로필 요약을 포함합니다.</small>
              </div>
            </div>
            <button class="profile-btn profile-btn-save" id="savePermissionsBtn">권한 저장</button>
          </div>

          <!-- 저장 상태 -->
          <div class="profile-save-status" id="saveStatus"></div>
        </div>
      `,this.attachEventListeners(e)}catch(s){console.error("프로필 패널 렌더링 실패:",s),e.innerHTML=`
        <div class="error-message">
          <p>프로필을 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${s.message}</p>
        </div>
      `}}renderBasicInfoFields(){return[{key:"name",label:"이름",type:"text",placeholder:"이름을 입력하세요"},{key:"nickname",label:"닉네임",type:"text",placeholder:"닉네임을 입력하세요"},{key:"email",label:"이메일",type:"email",placeholder:"email@example.com"},{key:"phone",label:"전화번호",type:"tel",placeholder:"010-0000-0000"},{key:"birthDate",label:"생년월일",type:"date",placeholder:""},{key:"gender",label:"성별",type:"select",options:["남성","여성","기타"]},{key:"idNumber",label:"주민번호",type:"text",placeholder:"000000-0000000",sensitive:!0},{key:"country",label:"국가",type:"text",placeholder:"대한민국"},{key:"address",label:"주소",type:"text",placeholder:"주소를 입력하세요"},{key:"timezone",label:"타임존",type:"select",options:["Asia/Seoul","UTC","America/New_York","Europe/London"]},{key:"language",label:"언어",type:"select",options:["ko","en","ja","zh"]}].map(t=>{const s=this.profile.basicInfo[t.key]||{},n=s.value||"",a=s.visibility||{visibleToSoul:!0,autoIncludeInContext:!0};let i="";if(t.type==="select"){const o=t.options.map(r=>`<option value="${r}" ${n===r?"selected":""}>${r}</option>`).join("");i=`
          <select class="profile-input" data-basic-field="${t.key}">
            <option value="">선택 안함</option>
            ${o}
          </select>
        `}else if(t.type==="date"){const o=n?new Date(n).toISOString().split("T")[0]:"";i=`
          <input type="${t.type}"
                 class="profile-input"
                 value="${o}"
                 data-basic-field="${t.key}"
                 placeholder="${t.placeholder}">
        `}else i=`
          <input type="${t.type}"
                 class="profile-input"
                 value="${n}"
                 data-basic-field="${t.key}"
                 placeholder="${t.placeholder}">
        `;return`
        <div class="profile-field-with-toggle">
          <div class="profile-field">
            <div class="profile-field-label-row">
              <div class="profile-field-label-header">
                <label>${t.label}</label>
                <div class="profile-field-toggles">
                  <label class="toggle-label" title="소울에게 공개">
                    <input type="checkbox"
                           class="toggle-checkbox"
                           data-basic-field="${t.key}"
                           data-visibility="visibleToSoul"
                           ${a.visibleToSoul?"checked":""}>
                    <span class="toggle-icon">${a.visibleToSoul?"👁️":"🔒"}</span>
                  </label>
                  <label class="toggle-label" title="자동 포함">
                    <input type="checkbox"
                           class="toggle-checkbox"
                           data-basic-field="${t.key}"
                           data-visibility="autoIncludeInContext"
                           ${a.autoIncludeInContext?"checked":""}>
                    <span class="toggle-icon">${a.autoIncludeInContext?"🔄":"⏸️"}</span>
                  </label>
                </div>
              </div>
              ${i}
              ${t.sensitive?'<small style="color: rgba(239, 68, 68, 0.8);">⚠️ 민감 정보</small>':""}
            </div>
          </div>
        </div>
      `}).join("")}renderCustomFields(){return!this.profile.customFields||this.profile.customFields.length===0?'<p class="profile-empty">추가 필드가 없습니다. "필드 추가" 버튼을 눌러 정보를 추가하세요.</p>':[...this.profile.customFields].sort((t,s)=>t.order-s.order).map(t=>`
      <div class="profile-custom-field"
           data-field-id="${t.id}"
           draggable="true">
        <div class="profile-field-drag-handle">☰</div>
        <div class="profile-field-content">
          <div class="profile-field-header">
            <input type="text"
                   class="profile-field-label"
                   value="${t.label}"
                   data-field-id="${t.id}"
                   data-prop="label"
                   placeholder="필드 이름">
            <button class="profile-field-delete" data-field-id="${t.id}">×</button>
          </div>
          <div class="profile-field-value">
            ${this.renderFieldInput(t)}
          </div>
          <div class="profile-field-meta">
            <select class="profile-field-type" data-field-id="${t.id}">
              <option value="text" ${t.type==="text"?"selected":""}>텍스트</option>
              <option value="number" ${t.type==="number"?"selected":""}>숫자</option>
              <option value="date" ${t.type==="date"?"selected":""}>날짜</option>
              <option value="tag" ${t.type==="tag"?"selected":""}>태그</option>
              <option value="list" ${t.type==="list"?"selected":""}>리스트</option>
              <option value="url" ${t.type==="url"?"selected":""}>URL</option>
            </select>
          </div>
        </div>
      </div>
    `).join("")}renderFieldInput(e){const t=e.value||"";switch(e.type){case"number":return`<input type="number" class="profile-field-input" value="${t}" data-field-id="${e.id}" data-prop="value">`;case"date":return`<input type="date" class="profile-field-input" value="${t}" data-field-id="${e.id}" data-prop="value">`;case"url":return`<input type="url" class="profile-field-input" value="${t}" data-field-id="${e.id}" data-prop="value" placeholder="https://">`;case"tag":return`<input type="text" class="profile-field-input" value="${t}" data-field-id="${e.id}" data-prop="value" placeholder="태그1, 태그2, ...">`;case"list":return`<textarea class="profile-field-input" data-field-id="${e.id}" data-prop="value" placeholder="항목을 줄바꿈으로 구분">${t}</textarea>`;case"text":default:return`<input type="text" class="profile-field-input" value="${t}" data-field-id="${e.id}" data-prop="value">`}}attachEventListeners(e){const t=e.querySelector("#profileImageInput");t&&t.addEventListener("change",i=>this.handleProfileImageUpload(i,e));const s=e.querySelector("#deleteProfileImageBtn");s&&s.addEventListener("click",()=>this.deleteProfileImage(e)),e.querySelectorAll(".profile-input[data-basic-field]").forEach(i=>{i.addEventListener("change",o=>this.saveBasicInfoValue(o.target))}),e.querySelectorAll(".toggle-checkbox[data-basic-field]").forEach(i=>{i.addEventListener("change",o=>this.saveBasicInfoVisibility(o.target))});const n=e.querySelector("#addFieldBtn");n&&n.addEventListener("click",()=>this.addField(e)),this.attachCustomFieldListeners(e);const a=e.querySelector("#savePermissionsBtn");a&&a.addEventListener("click",()=>this.savePermissions(e))}async handleProfileImageUpload(e,t){const s=e.target.files[0];if(s){if(!s.type.startsWith("image/")){this.showSaveStatus("❌ 이미지 파일만 업로드 가능합니다.","error");return}if(s.size>5*1024*1024){this.showSaveStatus("❌ 이미지 크기는 5MB 이하여야 합니다.","error");return}try{this.showSaveStatus("업로드 중...","info");const n=await this.resizeAndConvertToBase64(s,400,400),i=await(await fetch("/api/profile/p/image",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,imageData:n})})).json();if(!i.success)throw new Error(i.error||"업로드 실패");this.profile.profileImage=n,await this.renderProfilePanel(t),this.showSaveStatus("✓ 프로필 사진 저장됨","success"),this.updateMainAvatar(n)}catch(n){console.error("프로필 사진 업로드 실패:",n),this.showSaveStatus("❌ 업로드 실패","error")}}}resizeAndConvertToBase64(e,t,s){return new Promise((n,a)=>{const i=new FileReader;i.onload=o=>{const r=new Image;r.onload=()=>{const d=document.createElement("canvas");let{width:l,height:c}=r;l>c?l>t&&(c=Math.round(c*t/l),l=t):c>s&&(l=Math.round(l*s/c),c=s),d.width=l,d.height=c,d.getContext("2d").drawImage(r,0,0,l,c);const p=d.toDataURL("image/jpeg",.8);n(p)},r.onerror=a,r.src=o.target.result},i.onerror=a,i.readAsDataURL(e)})}async deleteProfileImage(e){if(confirm("프로필 사진을 삭제하시겠습니까?"))try{this.showSaveStatus("삭제 중...","info");const s=await(await fetch(`/api/profile/p/image?userId=${this.userId}`,{method:"DELETE"})).json();if(!s.success)throw new Error(s.error||"삭제 실패");this.profile.profileImage=null,await this.renderProfilePanel(e),this.showSaveStatus("✓ 프로필 사진 삭제됨","success"),this.updateMainAvatar(null)}catch(t){console.error("프로필 사진 삭제 실패:",t),this.showSaveStatus("❌ 삭제 실패","error")}}updateMainAvatar(e){const t=document.querySelector(".profile-section .avatar");t&&(e?(t.style.backgroundImage=`url(${e})`,t.style.backgroundSize="cover",t.style.backgroundPosition="center"):t.style.backgroundImage="")}attachCustomFieldListeners(e){const t=e.querySelector("#customFieldsContainer");t&&(t.querySelectorAll(".profile-custom-field").forEach(s=>{s.addEventListener("dragstart",n=>this.onDragStart(n)),s.addEventListener("dragover",n=>this.onDragOver(n)),s.addEventListener("drop",n=>this.onDrop(n,e)),s.addEventListener("dragend",n=>this.onDragEnd(n))}),t.querySelectorAll(".profile-field-label").forEach(s=>{s.addEventListener("change",n=>this.updateFieldProperty(n.target,e))}),t.querySelectorAll(".profile-field-input").forEach(s=>{s.addEventListener("change",n=>this.updateFieldProperty(n.target,e))}),t.querySelectorAll(".profile-field-type").forEach(s=>{s.addEventListener("change",n=>this.changeFieldType(n.target,e))}),t.querySelectorAll(".profile-field-delete").forEach(s=>{s.addEventListener("click",n=>this.deleteField(n.target.dataset.fieldId,e))}))}async saveBasicInfoValue(e){const t=e.dataset.basicField,s=e.value;try{if(this.showSaveStatus("저장 중...","info"),this.profile.basicInfo[t]||(this.profile.basicInfo[t]={}),this.profile.basicInfo[t].value=s,!(await fetch(`/api/profile/p/basic/${t}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({value:s})})).ok)throw new Error("저장 실패");this.showSaveStatus("✓ 저장됨","success"),setTimeout(()=>{this.hideSaveStatus()},2e3)}catch(n){console.error("기본 정보 저장 실패:",n),this.showSaveStatus("❌ 저장 실패","error"),setTimeout(()=>this.hideSaveStatus(),3e3)}}async saveBasicInfoVisibility(e){const t=e.dataset.basicField,s=e.dataset.visibility,n=e.checked;try{const a=e.nextElementSibling;if(s==="visibleToSoul"?a.textContent=n?"👁️":"🔒":s==="autoIncludeInContext"&&(a.textContent=n?"🔄":"⏸️"),this.showSaveStatus("저장 중...","info"),this.profile.basicInfo[t]||(this.profile.basicInfo[t]={visibility:{}}),this.profile.basicInfo[t].visibility||(this.profile.basicInfo[t].visibility={}),this.profile.basicInfo[t].visibility[s]=n,!(await fetch(`/api/profile/p/basic/${t}/visibility`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({[s]:n})})).ok)throw new Error("저장 실패");this.showSaveStatus("✓ 저장됨","success"),setTimeout(()=>{this.hideSaveStatus()},2e3)}catch(a){console.error("기본 정보 저장 실패:",a),this.showSaveStatus("✗ 저장 실패","error")}}async addField(e){const t={id:`field_${Date.now()}`,label:"새 필드",value:"",type:"text",order:this.profile.customFields.length};try{const n=await(await fetch("/api/profile/p/fields",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...t,userId:this.userId})})).json();if(!n.success)throw new Error(n.error||"필드 추가 실패");await this.renderProfilePanel(e),this.showSaveStatus("✓ 필드 추가됨","success")}catch(s){console.error("필드 추가 실패:",s),this.showSaveStatus("✗ 필드 추가 실패","error")}}async updateFieldProperty(e,t){const s=e.dataset.fieldId,n=e.dataset.prop,a=e.value;try{this.showSaveStatus("저장 중...","info");const o=await(await fetch(`/api/profile/p/fields/${s}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,[n]:a})})).json();if(!o.success)throw new Error(o.error||"필드 업데이트 실패");this.showSaveStatus("✓ 저장됨","success"),setTimeout(()=>{this.hideSaveStatus()},2e3)}catch(i){console.error("필드 업데이트 실패:",i),this.showSaveStatus("✗ 저장 실패","error")}}async changeFieldType(e,t){const s=e.dataset.fieldId,n=e.value;try{this.showSaveStatus("저장 중...","info");const i=await(await fetch(`/api/profile/p/fields/${s}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,type:n})})).json();if(!i.success)throw new Error(i.error||"필드 타입 변경 실패");await this.renderProfilePanel(t),this.showSaveStatus("✓ 타입 변경됨","success")}catch(a){console.error("필드 타입 변경 실패:",a),this.showSaveStatus("✗ 타입 변경 실패","error")}}async deleteField(e,t){if(confirm("이 필드를 삭제하시겠습니까?"))try{const n=await(await fetch(`/api/profile/p/fields/${e}?userId=${this.userId}`,{method:"DELETE"})).json();if(!n.success)throw new Error(n.error||"필드 삭제 실패");await this.renderProfilePanel(t),this.showSaveStatus("✓ 필드 삭제됨","success")}catch(s){console.error("필드 삭제 실패:",s),this.showSaveStatus("✗ 필드 삭제 실패","error")}}async savePermissions(e){try{const t=e.querySelector("#readScope").value,s=e.querySelector("#canWrite").checked,n=e.querySelector("#canDelete").checked,a=e.querySelector("#autoIncludeInContext").checked;this.showSaveStatus("저장 중...","info");const o=await(await fetch("/api/profile/p/permissions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,readScope:t,canWrite:s,canDelete:n,autoIncludeInContext:a})})).json();if(!o.success)throw new Error(o.error||"권한 저장 실패");this.showSaveStatus("✓ 권한 저장됨","success"),setTimeout(()=>{this.hideSaveStatus()},2e3)}catch(t){console.error("권한 저장 실패:",t),this.showSaveStatus("✗ 권한 저장 실패","error")}}onDragStart(e){this.draggedElement=e.target,e.target.style.opacity="0.5"}onDragOver(e){e.preventDefault();const t=this.getDragAfterElement(e.currentTarget.parentElement,e.clientY),s=this.draggedElement;t==null?e.currentTarget.parentElement.appendChild(s):e.currentTarget.parentElement.insertBefore(s,t)}async onDrop(e,t){e.preventDefault();const s=t.querySelector("#customFieldsContainer"),a=Array.from(s.querySelectorAll(".profile-custom-field")).map((i,o)=>({id:i.dataset.fieldId,order:o}));try{const o=await(await fetch("/api/profile/p/fields/reorder",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:this.userId,fieldOrders:a})})).json();if(!o.success)throw new Error(o.error||"순서 변경 실패");this.showSaveStatus("✓ 순서 변경됨","success")}catch(i){console.error("순서 변경 실패:",i),this.showSaveStatus("✗ 순서 변경 실패","error")}}onDragEnd(e){e.target.style.opacity="",this.draggedElement=null}getDragAfterElement(e,t){return[...e.querySelectorAll(".profile-custom-field:not(.dragging)")].reduce((n,a)=>{const i=a.getBoundingClientRect(),o=t-i.top-i.height/2;return o<0&&o>n.offset?{offset:o,element:a}:n},{offset:Number.NEGATIVE_INFINITY}).element}showSaveStatus(e,t){const s=document.getElementById("saveStatus");s&&(s.textContent=e,s.className=`profile-save-status ${t}`,s.style.display="block")}hideSaveStatus(){const e=document.getElementById("saveStatus");e&&(e.style.display="none")}}class R{constructor(e){this.apiClient=e,this.currentPanel=null,this.panelTitle=document.getElementById("panelTitle"),this.panelContent=document.getElementById("panelContent"),this.panels={search:{title:"통합 검색",render:()=>this.renderSearchPanel()},files:{title:"파일 매니저",render:()=>this.renderFilesPanel()},memory:{title:"메모리 탐색",render:()=>this.renderMemoryPanel()},mcp:{title:"MCP 관리",render:()=>this.renderMCPPanel()},archive:{title:"대화 아카이브",render:()=>this.renderArchivePanel()},notifications:{title:"알림",render:()=>this.renderNotificationsPanel()},settings:{title:"설정",render:()=>this.renderSettingsPanel()},context:{title:"컨텍스트",render:()=>this.renderContextPanel()},todo:{title:"TODO",render:()=>this.renderTodoPanel()},terminal:{title:"터미널",render:()=>this.renderTerminalPanel()},profile:{title:"프로필",render:()=>this.renderProfilePanel()}}}async openPanel(e){const t=this.panels[e];if(!t){console.warn(`알 수 없는 패널: ${e}`);return}this.currentPanel=e,this.panelTitle.textContent=t.title,this.panelContent.innerHTML='<div class="spinner" style="margin: 2rem auto;"></div>';try{await t.render();try{await this.apiClient.openPanel(e)}catch(s){console.warn("백엔드 패널 API 실패 (무시):",s.message)}}catch(s){console.error(`패널 렌더링 실패 [${e}]:`,s),this.panelContent.innerHTML=`
        <div style="padding: 2rem; text-align: center; color: var(--destructive);">
          <p>패널을 로드하는 중 오류가 발생했습니다.</p>
          <p style="font-size: var(--font-size-sm); margin-top: 0.5rem;">${s.message}</p>
        </div>
      `}}async closePanel(){if(this.currentPanel){try{await this.apiClient.closePanel(this.currentPanel)}catch(e){console.warn("백엔드 패널 닫기 API 실패 (무시):",e.message)}this.currentPanel=null}this.panelContent.innerHTML=""}async renderSearchPanel(){this.panelContent.innerHTML=`
      <div class="search-panel">
        <input
          type="text"
          id="searchInput"
          placeholder="검색어를 입력하세요..."
          style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 1rem;"
        >
        <div id="searchResults" style="margin-top: 1rem;">
          <p style="opacity: 0.7; text-align: center;">
            검색어를 입력하세요
          </p>
        </div>
      </div>
    `;const e=document.getElementById("searchInput"),t=document.getElementById("searchResults");e.addEventListener("input",async s=>{const n=s.target.value.trim();if(!n){t.innerHTML='<p style="opacity: 0.7; text-align: center;">검색어를 입력하세요</p>';return}t.innerHTML='<div class="spinner"></div>';try{const a=await this.apiClient.smartSearch(n);a.length===0?t.innerHTML='<p style="opacity: 0.7;">검색 결과가 없습니다.</p>':t.innerHTML=a.map(i=>`
            <div style="padding: 1rem; background: rgba(255, 255, 255, 0.08); border-radius: 8px; margin-bottom: 0.75rem;">
              <h4 style="margin-bottom: 0.5rem; color: #ffffff;">${i.title||i.id}</h4>
              <p style="font-size: 0.875rem; opacity: 0.8;">
                ${i.summary||""}
              </p>
            </div>
          `).join("")}catch(a){t.innerHTML=`<p style="color: #ff6b6b;">검색 실패: ${a.message}</p>`}})}async renderFilesPanel(){this.panelContent.innerHTML=`
      <div class="files-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          파일 매니저 (구현 예정)
        </p>
      </div>
    `}async renderMemoryPanel(){this.panelContent.innerHTML=`
      <div class="memory-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          메모리 탐색 (구현 예정)
        </p>
      </div>
    `}async renderMCPPanel(){this.panelContent.innerHTML=`
      <div class="mcp-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          MCP 관리 (구현 예정)
        </p>
      </div>
    `}async renderArchivePanel(){this.panelContent.innerHTML=`
      <div class="archive-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          대화 아카이브 (구현 예정)
        </p>
      </div>
    `}async renderNotificationsPanel(){try{const e=await this.apiClient.getNotifications();if(e.length===0){this.panelContent.innerHTML=`
          <p style="opacity: 0.7; text-align: center; padding: 2rem;">
            알림이 없습니다.
          </p>
        `;return}this.panelContent.innerHTML=e.map(t=>`
        <div style="padding: 1rem; background: ${t.read?"rgba(255, 255, 255, 0.05)":"rgba(255, 255, 255, 0.1)"}; border-radius: 8px; margin-bottom: 0.75rem; border-left: 3px solid rgba(255, 255, 255, 0.4);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <strong style="color: #ffffff;">${t.title}</strong>
            <span style="font-size: 0.75rem; opacity: 0.7;">
              ${new Date(t.timestamp).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}
            </span>
          </div>
          <p style="font-size: 0.875rem; opacity: 0.9;">
            ${t.message}
          </p>
        </div>
      `).join("")}catch{this.panelContent.innerHTML=`
        <p style="color: #ff6b6b; text-align: center; padding: 2rem;">
          알림을 불러오는데 실패했습니다.
        </p>
      `}}async renderSettingsPanel(){this.panelContent.innerHTML=`
      <div class="canvas-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 3rem; text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3;">⚙️</div>
        <h3 style="font-size: 1.25rem; font-weight: 500; margin-bottom: 1rem; opacity: 0.8;">
          설정은 왼쪽 메뉴에서
        </h3>
        <p style="font-size: 0.9375rem; opacity: 0.6; line-height: 1.6; max-width: 400px;">
          모든 설정 옵션은 왼쪽 메뉴의 설정 패널에서 관리할 수 있습니다.<br>
          이 공간은 향후 멀티 패널 작업 공간으로 사용될 예정입니다.
        </p>
        <button
          onclick="window.soulApp.menuManager.open(); window.soulApp.menuManager.switchMenu('settings');"
          style="margin-top: 2rem; padding: 0.875rem 1.5rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 10px; cursor: pointer; color: #ffffff; font-size: 0.9375rem; font-weight: 500; transition: all 0.2s;"
          onmouseover="this.style.background='rgba(96, 165, 250, 0.3)'"
          onmouseout="this.style.background='rgba(96, 165, 250, 0.2)'"
        >
          설정 열기
        </button>
      </div>
    `}async renderContextPanel(){try{const e=await this.apiClient.getTokenStatus();this.panelContent.innerHTML=`
        <div class="context-panel">
          <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.5rem; color: #ffffff;">토큰 사용량</h4>
            <div style="background: rgba(255, 255, 255, 0.1); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: rgba(255, 255, 255, 0.4); height: 100%; width: ${e.percentage||0}%;"></div>
            </div>
            <p style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.5rem;">
              ${e.used||0} / ${e.total||0} 토큰 (${e.percentage||0}%)
            </p>
          </div>

          <p style="opacity: 0.7; text-align: center;">
            컨텍스트 관리 기능 (구현 예정)
          </p>
        </div>
      `}catch{this.panelContent.innerHTML=`
        <p style="color: #ff6b6b; text-align: center; padding: 2rem;">
          컨텍스트 정보를 불러오는데 실패했습니다.
        </p>
      `}}async renderTodoPanel(){this.panelContent.innerHTML=`
      <div class="todo-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          TODO 관리 (구현 예정)
        </p>
      </div>
    `}async renderTerminalPanel(){this.panelContent.innerHTML=`
      <div class="terminal-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          터미널 (구현 예정)
        </p>
      </div>
    `}async renderProfilePanel(){await new A(this.apiClient).renderProfilePanel(this.panelContent)}}class H{constructor(){this.mainMenu=document.getElementById("mainMenu"),this.subMenu=document.getElementById("subMenu"),this.subMenuContent=document.getElementById("subMenuContent"),this.menuOverlay=document.getElementById("menuOverlay"),this.currentMenu="dashboard",this.menuContents={dashboard:{title:"대시보드",render:()=>this.renderDashboard()},conversations:{title:"대화 목록",render:()=>this.renderConversations()},search:{title:"통합 검색",render:()=>this.renderSearch()},memory:{title:"메모리 탐색",render:()=>this.renderMemory()},files:{title:"파일 관리",render:()=>this.renderFiles()},profile:{title:"프로필",render:()=>this.renderProfile()},roles:{title:"역할 관리",render:()=>this.renderRoles()},mcp:{title:"MCP 도구",render:()=>this.renderMCP()},aiSettings:{title:"AI 설정",render:()=>this.renderAISettings()},settings:{title:"설정",render:()=>this.renderSettings()}}}open(){this.mainMenu.classList.add("open"),this.subMenu.classList.add("open"),this.menuOverlay.classList.add("visible"),document.body.style.overflow="hidden",this.switchMenu(this.currentMenu)}close(){this.mainMenu.classList.remove("open"),this.subMenu.classList.remove("open"),this.menuOverlay.classList.remove("visible"),document.body.style.overflow=""}switchMenu(e){if(!this.menuContents[e]){console.warn(`알 수 없는 메뉴: ${e}`);return}this.currentMenu=e,document.querySelectorAll(".main-menu-item").forEach(s=>{s.dataset.menu===e?s.classList.add("active"):s.classList.remove("active")}),this.menuContents[e].render()}renderDashboard(){this.subMenuContent.innerHTML=`
      <div class="dashboard">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          대시보드
        </h2>

        <div class="dashboard-grid" style="display: grid; gap: 1rem;">
          <!-- 토큰 통계 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              토큰 사용량
            </h3>
            <div style="font-size: var(--font-size-sm); line-height: 1.8; opacity: 0.9;">
              <p>현재 세션: <span id="stat-tokens">-</span></p>
            </div>
          </div>

          <!-- 최근 활동 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              최근 활동
            </h3>
            <p style="font-size: var(--font-size-sm); opacity: 0.8;">
              활동 기록이 없습니다.
            </p>
          </div>

          <!-- 빠른 액션 -->
          <div class="dashboard-card" style="background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.15);">
            <h3 style="font-size: var(--font-size-lg); font-weight: 400; margin-bottom: 0.75rem;">
              빠른 액션
            </h3>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="action-btn" style="padding: 0.75rem; background: rgba(255, 255, 255, 0.2); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: var(--font-size-sm); font-weight: 400; transition: all 0.2s;">
                새 대화 시작
              </button>
              <button class="action-btn" style="padding: 0.75rem; background: rgba(255, 255, 255, 0.12); color: #ffffff; border: none; border-radius: 8px; cursor: pointer; font-size: var(--font-size-sm); font-weight: 400; transition: all 0.2s;">
                메모리 검색
              </button>
            </div>
          </div>
        </div>
      </div>
    `,k.loadTokenStats()}renderConversations(){this.subMenuContent.innerHTML=`
      <div class="conversations">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          대화 목록
        </h2>
        <div class="conversation-list">
          <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
            저장된 대화가 없습니다.
          </p>
        </div>
      </div>
    `}renderSearch(){this.subMenuContent.innerHTML=`
      <div class="search">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          통합 검색
        </h2>
        <input
          type="text"
          placeholder="검색어 입력..."
          style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: var(--font-size-base); margin-bottom: 1rem;"
        >
        <div style="margin-top: 1rem;">
          <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center;">
            검색 결과가 여기에 표시됩니다.
          </p>
        </div>
      </div>
    `}renderMemory(){this.subMenuContent.innerHTML=`
      <div class="memory">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          메모리 탐색
        </h2>
        <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
          메모리 데이터가 없습니다.
        </p>
      </div>
    `}renderFiles(){this.subMenuContent.innerHTML=`
      <div class="files">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          파일 관리
        </h2>
        <p style="font-size: var(--font-size-sm); opacity: 0.7; text-align: center; padding: 2rem;">
          파일이 없습니다.
        </p>
      </div>
    `}async renderRoles(){this.subMenuContent.innerHTML='<div class="loading">역할 관리 로딩 중...</div>';try{const e=window.roleManager;if(e){const t=await e.render();this.subMenuContent.innerHTML="",this.subMenuContent.appendChild(t)}else this.subMenuContent.innerHTML=`
          <div class="error">
            <p>역할 관리자를 초기화할 수 없습니다.</p>
          </div>
        `}catch(e){console.error("역할 UI 렌더링 실패:",e),this.subMenuContent.innerHTML=`
        <div class="error">
          <p>역할 관리 UI를 불러오는데 실패했습니다.</p>
          <p style="font-size: var(--font-size-sm); opacity: 0.7;">${e.message}</p>
        </div>
      `}}async renderMCP(){this.subMenuContent.innerHTML='<div class="loading" style="padding: 2rem; text-align: center;">MCP 관리자 로딩 중...</div>';try{const{MCPManager:e}=await M(async()=>{const{MCPManager:s}=await import("./mcp-manager-DvBdA_zw.js");return{MCPManager:s}},[]);await new e(window.soulApp.apiClient).render(this.subMenuContent)}catch(e){console.error("MCP Manager 로드 실패:",e),this.subMenuContent.innerHTML=`
        <div style="padding: 2rem; text-align: center;">
          <p style="color: #ef4444; margin-bottom: 1rem;">MCP 관리자를 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${e.message}</p>
        </div>
      `}}renderSettings(){const e=document.documentElement.getAttribute("data-theme")||"default",t=document.documentElement.getAttribute("data-font-size")||"md",s=window.soulApp.themeManager.getFromLocalStorage("glassIntensity","medium"),n=window.soulApp.themeManager.getFromLocalStorage("backgroundImage","");this.subMenuContent.innerHTML=`
      <div class="settings">
        <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem;">
          설정
        </h2>

        <!-- 테마 설정 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            테마
          </h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
            ${["default","basic","dark","ocean","forest","sunset"].map(a=>`
              <button
                class="theme-btn"
                data-theme="${a}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${a===e?"rgba(255, 255, 255, 0.4)":"rgba(255, 255, 255, 0.15)"}; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${a}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- 글씨 크기 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            글씨 크기
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${["xs","sm","md","lg","xl"].map(a=>`
              <button
                class="font-size-btn"
                data-size="${a}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${a===t?"rgba(255, 255, 255, 0.4)":"rgba(255, 255, 255, 0.15)"}; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${a.toUpperCase()}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- 유리 효과 강도 -->
        <div style="margin-bottom: 2rem;">
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            유리 효과 강도
          </h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
            ${["low","medium","high"].map(a=>`
              <button
                class="glass-intensity-btn"
                data-intensity="${a}"
                style="padding: 0.75rem; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); border: 2px solid ${a===s?"rgba(255, 255, 255, 0.4)":"rgba(255, 255, 255, 0.15)"}; border-radius: 8px; cursor: pointer; transition: all 0.2s; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
              >
                ${a==="low"?"낮음":a==="medium"?"중간":"높음"}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- 배경 이미지 -->
        <div>
          <h3 style="font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem;">
            배경 이미지
          </h3>
          <input
            type="text"
            id="backgroundImageInput"
            placeholder="이미지 URL 입력..."
            value="${n}"
            style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 0.75rem;"
          >
          <button
            id="applyBackgroundBtn"
            style="width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.15); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
          >
            배경 적용
          </button>
          ${n?`
            <button
              id="removeBackgroundBtn"
              style="width: 100%; padding: 0.75rem; background: rgba(220, 104, 104, 0.2); border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s; margin-top: 0.5rem;"
            >
              배경 제거
            </button>
          `:""}
        </div>
      </div>
    `,this.attachSettingsListeners()}attachSettingsListeners(){const e=document.getElementById("saveApiKeyBtn"),t=document.getElementById("anthropicApiKeyInput"),s=document.getElementById("apiKeyStatus");e&&t&&(e.addEventListener("click",async()=>{const o=t.value.trim();if(!o){s.innerHTML='<span style="color: #fbbf24;">⚠️ API 키를 입력해주세요</span>';return}if(!o.startsWith("sk-ant-")){s.innerHTML='<span style="color: #fbbf24;">⚠️ Anthropic API 키 형식이 아닙니다</span>';return}try{if(s.innerHTML='<span style="opacity: 0.7;">⏳ 저장 중...</span>',e.disabled=!0,!(await fetch("/api/config/api-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service:"anthropic",apiKey:o})})).ok)throw new Error("API 키 저장 실패");s.innerHTML='<span style="color: #10b981;">✅ API 키가 저장되었습니다 (즉시 적용)</span>',t.value="",setTimeout(()=>{s.innerHTML='<span style="color: #60a5fa;">💡 재시작 없이 바로 사용 가능합니다</span>'},2e3)}catch(r){s.innerHTML=`<span style="color: #ef4444;">❌ ${r.message}</span>`}finally{e.disabled=!1}}),t.addEventListener("keydown",o=>{o.key==="Enter"&&e.click()})),document.querySelectorAll(".theme-btn").forEach(o=>{o.addEventListener("click",()=>{const r=o.dataset.theme;window.soulApp.themeManager.applyTheme(r),this.renderSettings()})}),document.querySelectorAll(".font-size-btn").forEach(o=>{o.addEventListener("click",()=>{const r=o.dataset.size;window.soulApp.themeManager.setFontSize(r),this.renderSettings()})}),document.querySelectorAll(".glass-intensity-btn").forEach(o=>{o.addEventListener("click",()=>{const r=o.dataset.intensity;window.soulApp.themeManager.setGlassIntensity(r),this.renderSettings()})});const n=document.getElementById("applyBackgroundBtn");n&&n.addEventListener("click",()=>{const o=document.getElementById("backgroundImageInput").value.trim();o&&(window.soulApp.themeManager.setBackgroundImage(o),this.renderSettings())});const a=document.getElementById("removeBackgroundBtn");a&&a.addEventListener("click",()=>{window.soulApp.themeManager.removeBackgroundImage(),this.renderSettings()});const i=document.getElementById("backgroundImageInput");i&&i.addEventListener("keydown",o=>{if(o.key==="Enter"){const r=o.target.value.trim();r&&(window.soulApp.themeManager.setBackgroundImage(r),this.renderSettings())}})}async renderAISettings(){this.subMenuContent.innerHTML='<div class="loading">AI 설정 로딩 중...</div>';try{const{SettingsManager:e}=await M(async()=>{const{SettingsManager:s}=await import("./settings-manager-BooauTof.js");return{SettingsManager:s}},[]);await new e(window.soulApp.apiClient).render(this.subMenuContent,"ai")}catch(e){console.error("AI 설정 로드 실패:",e),this.subMenuContent.innerHTML=`
        <div style="padding: 2rem; text-align: center;">
          <p style="color: #ef4444; margin-bottom: 1rem;">AI 설정을 불러오는데 실패했습니다.</p>
          <p style="font-size: 0.875rem; opacity: 0.7;">${e.message}</p>
        </div>
      `}}renderAISettingsOld(){this.subMenuContent.innerHTML=`
      <div style="padding: 1.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 600; margin-bottom: 2rem;">
          🤖 AI 설정
        </h2>

        <!-- API 키 설정 -->
        <div style="margin-bottom: 3rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: rgba(255, 255, 255, 0.95);">
            🔑 API 키 관리
          </h3>

          <!-- Anthropic -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>Anthropic Claude</span>
              <span id="anthropicStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="anthropicApiKeyInput"
              placeholder="sk-ant-api03-..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveAnthropicKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteAnthropicKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="anthropicKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <!-- OpenAI -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>OpenAI GPT</span>
              <span id="openaiStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="openaiApiKeyInput"
              placeholder="sk-..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveOpenaiKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteOpenaiKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="openaiKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <!-- Google -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>Google Gemini</span>
              <span id="googleStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="googleApiKeyInput"
              placeholder="AIza..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveGoogleKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteGoogleKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="googleKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://makersuite.google.com/app/apikey" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <!-- xAI -->
          <div style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>xAI Grok</span>
              <span id="xaiStatus" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border-radius: 4px; font-weight: 400;">미설정</span>
            </h4>
            <input
              type="password"
              id="xaiApiKeyInput"
              placeholder="xai-..."
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 0.75rem; font-family: 'Courier New', monospace;"
            >
            <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem;">
              <button
                id="saveXaiKeyBtn"
                style="flex: 1; padding: 0.75rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                저장
              </button>
              <button
                id="deleteXaiKeyBtn"
                style="padding: 0.75rem 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; cursor: pointer; color: #ef4444; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              >
                삭제
              </button>
            </div>
            <div id="xaiKeyStatus" style="font-size: 0.8125rem; text-align: center;"></div>
            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              <a href="https://console.x.ai/" target="_blank" style="color: #60a5fa; text-decoration: underline;">API 키 발급받기 →</a>
            </p>
          </div>

          <div style="padding: 1rem; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.2);">
            <p style="font-size: 0.8125rem; opacity: 0.9; line-height: 1.6;">
              💡 API 키는 서버에 AES-256-CBC 암호화되어 저장됩니다.<br>
              서버 재시작 없이 즉시 적용되며, 안전하게 관리됩니다.
            </p>
          </div>
        </div>

        <!-- 모델 설정 -->
        <div style="margin-bottom: 3rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: rgba(255, 255, 255, 0.95);">
            🎯 모델 설정
          </h3>

          <div style="padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <label style="display: block; margin-bottom: 0.75rem; font-size: 0.875rem; opacity: 0.9;">
              AI 서비스 선택
            </label>
            <select
              id="defaultServiceSelect"
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; margin-bottom: 1rem;"
            >
              <option value="">-- 서비스를 선택하세요 --</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI GPT</option>
              <option value="google">Google Gemini</option>
              <option value="xai">xAI Grok</option>
            </select>

            <label style="display: block; margin-bottom: 0.75rem; font-size: 0.875rem; opacity: 0.9;">
              모델 선택
            </label>
            <select
              id="defaultModelSelect"
              style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem;"
              disabled
            >
              <option value="">-- 먼저 서비스를 선택하세요 --</option>
            </select>

            <div id="modelSelectStatus" style="margin-top: 1rem; font-size: 0.8125rem; text-align: center;"></div>

            <button
              id="saveDefaultModelBtn"
              style="width: 100%; padding: 0.875rem; margin-top: 1rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
              disabled
            >
              기본 모델 저장
            </button>

            <p style="font-size: 0.75rem; opacity: 0.7; margin-top: 0.75rem;">
              일반 대화에 사용할 기본 모델을 선택하세요. 서비스별로 사용 가능한 최신 모델만 표시됩니다.
            </p>
          </div>
        </div>

        <!-- AI 서비스 관리 -->
        <div style="margin-bottom: 3rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.25rem; font-weight: 600; margin: 0; color: rgba(255, 255, 255, 0.95);">
              🔌 AI 서비스 관리
            </h3>
            <button
              id="addServiceBtn"
              style="padding: 0.5rem 1rem; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500;"
            >
              + 서비스 추가
            </button>
          </div>

          <div id="servicesContainer" style="display: grid; gap: 1rem;">
            <!-- 서비스 카드들이 여기 렌더링됨 -->
          </div>
        </div>

        <!-- 시스템 프롬프트 -->
        <div style="margin-bottom: 3rem;">
          <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; color: rgba(255, 255, 255, 0.95);">
            📝 시스템 프롬프트
          </h3>

          <div style="padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <textarea
              id="systemPromptTextarea"
              placeholder="AI의 기본 성격과 역할을 정의하세요..."
              style="width: 100%; min-height: 200px; padding: 1rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.875rem; resize: vertical; font-family: 'Courier New', monospace; line-height: 1.6;"
            >당신은 친절하고 도움이 되는 AI 어시스턴트입니다.</textarea>
            <button
              id="saveSystemPromptBtn"
              style="width: 100%; padding: 0.875rem; margin-top: 1rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 500; transition: all 0.2s;"
            >
              시스템 프롬프트 저장
            </button>
            <div id="systemPromptStatus" style="margin-top: 0.75rem; font-size: 0.8125rem; text-align: center;"></div>
          </div>
        </div>
      </div>
    `,this.attachAISettingsListeners()}attachAISettingsListeners(){const e=(l,c,u,p,g,h)=>{const f=document.getElementById(u),w=document.getElementById(p),S=document.getElementById(c),y=document.getElementById(g),b=document.getElementById(h);fetch(`/api/config/api-key/${l}`).then(v=>v.json()).then(v=>{v.configured&&(b.textContent="설정됨",b.style.background="rgba(16, 185, 129, 0.2)",b.style.color="#10b981")}).catch(()=>{}),f&&S&&f.addEventListener("click",async()=>{const v=S.value.trim();if(!v){y.innerHTML='<span style="color: #fbbf24;">⚠️ API 키를 입력해주세요</span>';return}try{y.innerHTML='<span style="opacity: 0.7;">⏳ API 키 검증 중...</span>',f.disabled=!0;const E=await(await fetch("/api/config/api-key/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service:l,apiKey:v})})).json();if(!E.success)throw new Error(E.message||"API 키가 유효하지 않습니다");if(y.innerHTML='<span style="opacity: 0.7;">⏳ 저장 중...</span>',!(await fetch("/api/config/api-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service:l,apiKey:v})})).ok)throw new Error("저장 실패");y.innerHTML='<span style="color: #10b981;">✅ 저장되었습니다</span>',S.value="",b.textContent="설정됨",b.style.background="rgba(16, 185, 129, 0.2)",b.style.color="#10b981",setTimeout(()=>{y.innerHTML='<span style="color: #60a5fa;">💡 재시작 없이 바로 사용 가능</span>'},2e3)}catch(I){y.innerHTML=`<span style="color: #ef4444;">❌ ${I.message}</span>`}finally{f.disabled=!1}}),w&&w.addEventListener("click",async()=>{if(confirm(`${l} API 키를 삭제하시겠습니까?`))try{if(y.innerHTML='<span style="opacity: 0.7;">⏳ 삭제 중...</span>',w.disabled=!0,!(await fetch(`/api/config/api-key/${l}`,{method:"DELETE"})).ok)throw new Error("삭제 실패");y.innerHTML='<span style="color: #10b981;">✅ 삭제되었습니다</span>',b.textContent="미설정",b.style.background="rgba(96, 165, 250, 0.2)",b.style.color="rgba(255, 255, 255, 0.9)",setTimeout(()=>{y.innerHTML=""},3e3)}catch(v){y.innerHTML=`<span style="color: #ef4444;">❌ ${v.message}</span>`}finally{w.disabled=!1}})};e("anthropic","anthropicApiKeyInput","saveAnthropicKeyBtn","deleteAnthropicKeyBtn","anthropicKeyStatus","anthropicStatus"),e("openai","openaiApiKeyInput","saveOpenaiKeyBtn","deleteOpenaiKeyBtn","openaiKeyStatus","openaiStatus"),e("google","googleApiKeyInput","saveGoogleKeyBtn","deleteGoogleKeyBtn","googleKeyStatus","googleStatus"),e("xai","xaiApiKeyInput","saveXaiKeyBtn","deleteXaiKeyBtn","xaiKeyStatus","xaiStatus");const t=document.getElementById("defaultServiceSelect"),s=document.getElementById("defaultModelSelect"),n=document.getElementById("saveDefaultModelBtn"),a=document.getElementById("modelSelectStatus");t&&s&&t.addEventListener("change",async l=>{const c=l.target.value;if(!c){s.disabled=!0,s.innerHTML='<option value="">-- 먼저 서비스를 선택하세요 --</option>',n.disabled=!0,a.innerHTML="";return}try{a.innerHTML='<span style="opacity: 0.7;">⏳ 모델 목록 불러오는 중...</span>',s.disabled=!0;const p=await(await fetch(`/api/config/models/${c}`)).json();if(!p.success||!p.models||p.models.length===0)throw new Error(p.error||"모델 목록을 불러올 수 없습니다");s.innerHTML=p.models.map(g=>`<option value="${g.id}">${g.name}${g.description?" - "+g.description:""}</option>`).join(""),s.disabled=!1,n.disabled=!1,a.innerHTML=`<span style="color: #10b981;">✅ ${p.models.length}개 모델 로드됨</span>`,setTimeout(()=>{a.innerHTML=""},3e3)}catch(u){s.innerHTML='<option value="">모델을 불러올 수 없습니다</option>',s.disabled=!0,n.disabled=!0,a.innerHTML=`<span style="color: #ef4444;">❌ ${u.message}</span>`}}),n&&t&&s&&n.addEventListener("click",async()=>{const l=t.value,c=s.value;if(!l||!c){a.innerHTML='<span style="color: #fbbf24;">⚠️ 서비스와 모델을 선택해주세요</span>';return}try{if(a.innerHTML='<span style="opacity: 0.7;">⏳ 저장 중...</span>',n.disabled=!0,!(await fetch("/api/config/ai/default",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({service:l,model:c})})).ok)throw new Error("저장 실패");a.innerHTML='<span style="color: #10b981;">✅ 기본 모델이 저장되었습니다</span>',setTimeout(()=>{a.innerHTML=""},3e3)}catch(u){a.innerHTML=`<span style="color: #ef4444;">❌ ${u.message}</span>`}finally{n.disabled=!1}});const i=document.getElementById("saveSystemPromptBtn"),o=document.getElementById("systemPromptTextarea"),r=document.getElementById("systemPromptStatus");i&&o&&i.addEventListener("click",async()=>{if(!o.value.trim()){r.innerHTML='<span style="color: #fbbf24;">⚠️ 프롬프트를 입력해주세요</span>';return}try{r.innerHTML='<span style="opacity: 0.7;">⏳ 저장 중...</span>',i.disabled=!0,r.innerHTML='<span style="color: #10b981;">✅ 저장되었습니다</span>',setTimeout(()=>{r.innerHTML=""},3e3)}catch(c){r.innerHTML=`<span style="color: #ef4444;">❌ ${c.message}</span>`}finally{i.disabled=!1}}),this.loadAIServices();const d=document.getElementById("addServiceBtn");d&&d.addEventListener("click",()=>{this.showAddServiceModal()})}async loadAIServices(){const e=document.getElementById("servicesContainer");if(e)try{const s=await(await fetch("/api/ai-services")).json();if(!s.success||!s.services)throw new Error("서비스 목록을 불러올 수 없습니다");e.innerHTML=s.services.map(n=>this.renderServiceCard(n)).join(""),s.services.forEach(n=>{this.attachServiceCardListeners(n)})}catch(t){e.innerHTML=`<p style="color: #ef4444; text-align: center; padding: 2rem;">❌ ${t.message}</p>`}}renderServiceCard(e){const t=e.isActive?"#10b981":"#6b7280",s=e.isActive?"활성":"비활성",n=e.isBuiltIn?'<span style="padding: 0.25rem 0.5rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 4px; font-size: 0.75rem; color: #60a5fa;">기본</span>':"";return`
      <div class="service-card" data-service-id="${e.id}" style="padding: 1.5rem; background: rgba(255, 255, 255, 0.05); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
              <h4 style="margin: 0; font-size: 1rem; font-weight: 600;">${e.name}</h4>
              ${n}
              <span style="padding: 0.25rem 0.5rem; background: rgba(${t==="#10b981"?"16, 185, 129":"107, 114, 128"}, 0.2); border: 1px solid ${t}; border-radius: 4px; font-size: 0.75rem; color: ${t};">${s}</span>
            </div>
            <p style="margin: 0; font-size: 0.8125rem; opacity: 0.7;">${e.baseUrl}</p>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.75rem; opacity: 0.6;">
              타입: ${e.type} |
              API 키: ${e.hasApiKey?"✓ 설정됨":"✗ 미설정"} |
              모델: ${e.modelCount}개
            </p>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button
            class="toggle-service-btn"
            data-service-id="${e.id}"
            style="padding: 0.5rem 1rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            ${e.isActive?"비활성화":"활성화"}
          </button>
          <button
            class="refresh-models-btn"
            data-service-id="${e.id}"
            style="padding: 0.5rem 1rem; background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            모델 갱신
          </button>
          <button
            class="test-service-btn"
            data-service-id="${e.id}"
            style="padding: 0.5rem 1rem; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            연결 테스트
          </button>
          ${e.isBuiltIn?"":`
          <button
            class="edit-service-btn"
            data-service-id="${e.id}"
            style="padding: 0.5rem 1rem; background: rgba(251, 191, 36, 0.2); border: 1px solid rgba(251, 191, 36, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            수정
          </button>
          <button
            class="delete-service-btn"
            data-service-id="${e.id}"
            style="padding: 0.5rem 1rem; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; cursor: pointer; color: #ffffff; font-size: 0.8125rem;"
          >
            삭제
          </button>
          `}
        </div>
      </div>
    `}attachServiceCardListeners(e){const t=document.querySelector(`.toggle-service-btn[data-service-id="${e.id}"]`);t&&t.addEventListener("click",async()=>{try{const o=await(await fetch(`/api/ai-services/${e.id}/toggle`,{method:"POST"})).json();o.success?this.loadAIServices():alert(o.error||"토글 실패")}catch(i){alert("오류: "+i.message)}});const s=document.querySelector(`.refresh-models-btn[data-service-id="${e.id}"]`);s&&s.addEventListener("click",async()=>{try{s.disabled=!0,s.textContent="갱신 중...";const o=await(await fetch(`/api/ai-services/${e.id}/refresh-models`,{method:"POST"})).json();o.success?(alert(`✓ ${o.message}`),this.loadAIServices()):alert(o.error||"모델 갱신 실패")}catch(i){alert("오류: "+i.message)}finally{s.disabled=!1,s.textContent="모델 갱신"}});const n=document.querySelector(`.test-service-btn[data-service-id="${e.id}"]`);n&&n.addEventListener("click",async()=>{try{n.disabled=!0,n.textContent="테스트 중...";const o=await(await fetch(`/api/ai-services/${e.id}/test`,{method:"POST"})).json();alert(o.success?`✓ ${o.message}`:`✗ ${o.message}`)}catch(i){alert("오류: "+i.message)}finally{n.disabled=!1,n.textContent="연결 테스트"}});const a=document.querySelector(`.delete-service-btn[data-service-id="${e.id}"]`);a&&a.addEventListener("click",async()=>{if(confirm(`"${e.name}" 서비스를 삭제하시겠습니까?`))try{const o=await(await fetch(`/api/ai-services/${e.id}`,{method:"DELETE"})).json();o.success?(alert("✓ "+o.message),this.loadAIServices()):alert(o.error||"삭제 실패")}catch(i){alert("오류: "+i.message)}})}showAddServiceModal(){const e=document.createElement("div");e.style.cssText=`
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `,e.innerHTML=`
      <div class="modal-content" style="background: #ffffff; padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">
        <h3 style="margin: 0 0 1.5rem 0; font-size: 1.25rem; color: #1a1a2e; font-weight: 600;">AI 서비스 추가</h3>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">서비스 ID</label>
          <input
            id="modalServiceId"
            type="text"
            placeholder="예: my-custom-ai"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">서비스 이름</label>
          <input
            id="modalServiceName"
            type="text"
            placeholder="예: My Custom AI"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">타입</label>
          <select
            id="modalServiceType"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          >
            <option value="openai-compatible">OpenAI 호환</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">Base URL</label>
          <input
            id="modalServiceUrl"
            type="text"
            placeholder="예: https://api.example.com/v1"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; color: #374151; font-weight: 500;">API Key (선택)</label>
          <input
            id="modalServiceApiKey"
            type="password"
            placeholder="API 키가 필요한 경우 입력"
            style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; background: #ffffff; color: #1f2937; font-size: 0.875rem;"
          />
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <button
            id="modalCancelBtn"
            style="flex: 1; padding: 0.75rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; color: #374151; font-size: 0.875rem; font-weight: 500;"
          >
            취소
          </button>
          <button
            id="modalSaveBtn"
            style="flex: 1; padding: 0.75rem; background: #10b981; border: none; border-radius: 8px; cursor: pointer; color: #ffffff; font-size: 0.875rem; font-weight: 600;"
          >
            저장
          </button>
        </div>
      </div>
    `,document.body.appendChild(e),e.querySelector(".modal-content").addEventListener("click",s=>{s.stopPropagation()}),document.getElementById("modalCancelBtn").addEventListener("click",()=>{e.remove()}),document.getElementById("modalSaveBtn").addEventListener("click",async()=>{const s=document.getElementById("modalServiceId").value.trim(),n=document.getElementById("modalServiceName").value.trim(),a=document.getElementById("modalServiceType").value,i=document.getElementById("modalServiceUrl").value.trim(),o=document.getElementById("modalServiceApiKey").value.trim();if(!s||!n||!i){alert("필수 항목을 모두 입력해주세요");return}try{const d=await(await fetch("/api/ai-services",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({serviceId:s,name:n,type:a,baseUrl:i,apiKey:o})})).json();d.success?(alert("✓ "+d.message),e.remove(),this.loadAIServices()):alert(d.error||"저장 실패")}catch(r){alert("오류: "+r.message)}}),e.addEventListener("click",()=>{e.remove()})}renderProfile(){this.subMenuContent.innerHTML=`
      <div class="profile-menu">
        <h2 style="font-size: var(--font-size-xl); font-weight: 400; margin-bottom: 1.5rem;">
          프로필 관리
        </h2>

        <div class="menu-description" style="background: rgba(255, 255, 255, 0.08); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: var(--font-size-sm); line-height: 1.6; opacity: 0.9;">
          <p>소원님의 개인 정보를 관리하고, 소울이 참조할 수 있는 프로필을 설정합니다.</p>
          <p style="margin-top: 0.5rem; font-size: 0.875rem; opacity: 0.8;">
            필드를 자유롭게 추가/수정하고, 소울의 접근 권한을 설정할 수 있습니다.
          </p>
        </div>

        <div class="menu-actions" style="display: flex; flex-direction: column; gap: 0.75rem;">
          <button
            class="menu-action-btn"
            onclick="window.soulApp.panelManager.openPanel('profile')"
            style="padding: 1rem; background: rgba(96, 165, 250, 0.2); color: #ffffff; border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 8px; cursor: pointer; font-size: var(--font-size-base); font-weight: 400; transition: all 0.2s; text-align: left;"
          >
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 1.5rem;">👤</span>
              <div>
                <div style="font-weight: 500; margin-bottom: 0.25rem;">프로필 관리</div>
                <div style="font-size: 0.875rem; opacity: 0.8;">개인 정보 및 커스텀 필드 편집</div>
              </div>
            </div>
          </button>

          <div style="background: rgba(255, 255, 255, 0.06); padding: 1rem; border-radius: 8px;">
            <h3 style="font-size: var(--font-size-base); font-weight: 500; margin-bottom: 0.75rem;">
              프로필 구성 요소
            </h3>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: var(--font-size-sm); line-height: 2; opacity: 0.9;">
              <li>✓ 기본 정보 (이름, 닉네임, 위치, 타임존)</li>
              <li>✓ 커스텀 필드 (자유롭게 추가 가능)</li>
              <li>✓ 권한 설정 (소울의 접근 범위 제어)</li>
              <li>✓ 자동 컨텍스트 포함 (대화 시 자동 참조)</li>
            </ul>
          </div>

          <div style="background: rgba(139, 92, 246, 0.15); padding: 1rem; border-radius: 8px; border: 1px solid rgba(139, 92, 246, 0.3);">
            <h3 style="font-size: var(--font-size-base); font-weight: 500; margin-bottom: 0.5rem;">
              💡 사용 팁
            </h3>
            <p style="font-size: var(--font-size-sm); line-height: 1.6; opacity: 0.9; margin: 0;">
              프로필 정보는 대화 시 소울이 자동으로 참조합니다.
              취향, 관심사, 중요한 날짜 등을 추가하면 더 개인화된 대화가 가능합니다.
            </p>
          </div>
        </div>
      </div>
    `,this.subMenuContent.querySelectorAll(".menu-action-btn").forEach(t=>{t.addEventListener("mouseenter",()=>{t.style.background="rgba(96, 165, 250, 0.3)",t.style.transform="translateX(4px)"}),t.addEventListener("mouseleave",()=>{t.style.background="rgba(96, 165, 250, 0.2)",t.style.transform="translateX(0)"})})}}class q{constructor(e="/api"){this.baseURL=e,console.log(`🔧 APIClient initialized with baseURL: ${this.baseURL}`),console.log(`🔧 window.location.origin: ${window.location.origin}`),console.log(`🔧 window.location.href: ${window.location.href}`)}async request(e,t={}){const s=`${this.baseURL}${e}`;console.log(`🌐 API Request - endpoint: ${e}`),console.log(`🌐 API Request - this.baseURL: ${this.baseURL}`),console.log(`🌐 API Request - constructed url: ${s}`),console.log(`🌐 API Request - window.location.origin: ${window.location.origin}`),console.log(`🌐 Full URL will be: ${new URL(s,window.location.origin).href}`);const n={headers:{"Content-Type":"application/json",...t.headers},...t},a=new AbortController,i=setTimeout(()=>a.abort(),1e4);n.signal=a.signal;try{const o=await fetch(s,n);if(clearTimeout(i),!o.ok){const r=await o.json().catch(()=>({}));throw new Error(r.message||`HTTP ${o.status}: ${o.statusText}`)}return await o.json()}catch(o){throw clearTimeout(i),o.name==="AbortError"?(console.warn(`API 요청 타임아웃 [${e}]`),new Error("Request timeout")):(console.error(`API 요청 실패 [${e}]:`,o),o)}}async get(e){return this.request(e,{method:"GET"})}async post(e,t){return this.request(e,{method:"POST",body:JSON.stringify(t)})}async patch(e,t){return this.request(e,{method:"PATCH",body:JSON.stringify(t)})}async delete(e){return this.request(e,{method:"DELETE"})}async put(e,t){return this.request(e,{method:"PUT",body:JSON.stringify(t)})}async sendMessage(e,t={}){return this.post("/chat",{message:e,sessionId:"main-conversation",options:{maxTokens:4096,temperature:1,...t}})}async getConversationHistory(e="main-conversation",t={}){const s=new URLSearchParams;t.limit&&s.append("limit",t.limit),t.before&&s.append("before",t.before),t.after&&s.append("after",t.after);const n=s.toString()?`?${s}`:"";return this.get(`/chat/history/${e}${n}`)}async resumeSession(e){return this.post("/chat/resume",{sessionId:e})}async endSession(e){return this.post("/chat/end",{sessionId:e})}async getMemoryStats(){return this.get("/chat/memory-stats")}async getTokenStatus(){return this.get("/chat/token-status")}async getUserProfile(e){return this.get(`/profile/user/${e}`)}async updateUserProfile(e,t){return this.patch(`/profile/user/${e}`,t)}async getThemeSettings(e){return this.get(`/profile/user/${e}/theme`)}async updateThemeSettings(e,t){return this.patch(`/profile/user/${e}/theme`,t)}async getNotifications(e={}){const t=new URLSearchParams;e.unreadOnly&&t.append("unreadOnly","true"),e.limit&&t.append("limit",e.limit);const s=t.toString()?`?${t}`:"";return this.get(`/notifications${s}`)}async markNotificationAsRead(e){return this.post(`/notifications/${e}/read`)}async markAllNotificationsAsRead(){return this.post("/notifications/mark-all-read")}async getPanelState(){return this.get("/panel/state")}async openPanel(e,t={}){return this.post(`/panel/${e}/open`,t)}async closePanel(e){return this.post(`/panel/${e}/close`)}async search(e,t={}){const s=new URLSearchParams({q:e,...t});return this.get(`/search?${s}`)}async smartSearch(e,t={}){return this.post("/search/smart",{query:e,...t})}async getTags(){return this.get("/search/tags")}async archiveConversation(e,t={}){return this.post("/memory/archive",{conversationId:e,...t})}async getMemories(e={}){const t=new URLSearchParams(e);return this.get(`/memory/list?${t}`)}async getMemoryById(e){return this.get(`/memory/${e}`)}async getRelationshipGraph(){return this.get("/memory-advanced/relationship-graph")}async getTimeline(e={}){const t=new URLSearchParams(e);return this.get(`/memory-advanced/timeline?${t}`)}async getMCPTools(){return this.get("/mcp/tools")}async executeMCPTool(e,t={}){return this.post("/mcp/execute",{toolName:e,params:t})}}class D{constructor(e){this.apiClient=e,this.roles=[],this.selectedRole=null}async render(){const e=document.createElement("div");return e.className="role-manager",e.innerHTML=`
      <div class="role-manager-header">
        <h2>👥 역할 관리 (알바 관리)</h2>
        <p class="subtitle">Soul의 전문가 팀을 관리하세요</p>
      </div>

      <div class="role-manager-actions">
        <button class="btn btn-primary" id="createRoleBtn">
          <span class="icon">➕</span>
          새 역할 고용
        </button>
        <button class="btn btn-secondary" id="autoManageBtn">
          <span class="icon">⚡</span>
          자동 최적화
        </button>
        <button class="btn btn-secondary" id="refreshRolesBtn">
          <span class="icon">🔄</span>
          새로고침
        </button>
      </div>

      <div class="role-stats-summary" id="roleStatsSummary">
        <div class="stat-card">
          <div class="stat-value" id="totalRoles">-</div>
          <div class="stat-label">전체 역할</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="activeRoles">-</div>
          <div class="stat-label">활성 역할</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="totalUsage">-</div>
          <div class="stat-label">총 사용 횟수</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="avgSuccessRate">-</div>
          <div class="stat-label">평균 성공률</div>
        </div>
      </div>

      <div class="role-filters">
        <select id="categoryFilter" class="filter-select">
          <option value="all">모든 카테고리</option>
          <option value="content">콘텐츠</option>
          <option value="code">코드</option>
          <option value="data">데이터</option>
          <option value="creative">크리에이티브</option>
          <option value="technical">기술</option>
          <option value="other">기타</option>
        </select>

        <select id="statusFilter" class="filter-select">
          <option value="all">모든 상태</option>
          <option value="active">활성</option>
          <option value="inactive">비활성</option>
        </select>

        <select id="sortBy" class="filter-select">
          <option value="usageCount">사용 횟수순</option>
          <option value="lastUsed">최근 사용순</option>
          <option value="successRate">성공률순</option>
          <option value="name">이름순</option>
        </select>
      </div>

      <div class="role-list" id="roleList">
        <div class="loading">역할 로딩 중...</div>
      </div>
    `,e.querySelector("#createRoleBtn").addEventListener("click",()=>this.showCreateForm()),e.querySelector("#autoManageBtn").addEventListener("click",()=>this.runAutoManage()),e.querySelector("#refreshRolesBtn").addEventListener("click",()=>this.loadRoles()),e.querySelector("#categoryFilter").addEventListener("change",()=>this.loadRoles()),e.querySelector("#statusFilter").addEventListener("change",()=>this.loadRoles()),e.querySelector("#sortBy").addEventListener("change",()=>this.loadRoles()),await this.loadRoles(),e}async loadRoles(){var o,r,d;const e=document.getElementById("roleList");e&&(e.innerHTML='<div class="loading">역할 로딩 중...</div>');const t=(o=document.getElementById("categoryFilter"))==null?void 0:o.value,s=(r=document.getElementById("statusFilter"))==null?void 0:r.value,n=(d=document.getElementById("sortBy"))==null?void 0:d.value;let a="/roles";const i=[];t&&t!=="all"&&i.push(`category=${t}`),s==="active"&&i.push("active=true"),s==="inactive"&&i.push("active=false"),n&&i.push(`sortBy=${n}`),i.length>0&&(a+="?"+i.join("&"));try{const l=await this.apiClient.get(a);if(l.success)this.roles=l.roles,this.renderRoleList(),this.updateStats();else throw new Error(l.error||"역할 로드 실패")}catch(l){console.error("역할 로드 실패:",l);const c=document.getElementById("roleList");c&&(c.innerHTML=`
          <div class="error-state">
            <p style="color: #ef4444; margin-bottom: 0.5rem;">❌ 역할을 불러오는데 실패했습니다</p>
            <p style="font-size: 0.875rem; opacity: 0.7; margin-bottom: 1rem;">${l.message}</p>
            <button class="btn btn-primary" onclick="window.roleManager.loadRoles()">다시 시도</button>
          </div>
        `),this.roles=[],this.updateStats()}}renderRoleList(){const e=document.getElementById("roleList");if(this.roles.length===0){e.innerHTML='<div class="empty-state">역할이 없습니다.</div>';return}e.innerHTML=this.roles.map(t=>`
      <div class="role-card ${t.active?"":"inactive"}" data-role-id="${t.roleId}">
        <div class="role-card-header">
          <div class="role-info">
            <h3 class="role-name">${t.name}</h3>
            <span class="role-badge role-badge-${t.category}">${this.getCategoryLabel(t.category)}</span>
            ${t.createdBy==="auto"?'<span class="role-badge role-badge-auto">자동생성</span>':""}
            ${t.active?"":'<span class="role-badge role-badge-inactive">비활성</span>'}
          </div>
          <div class="role-actions">
            <button class="btn-icon" onclick="roleManager.viewRole('${t.roleId}')" title="상세보기">
              <span class="icon">👁️</span>
            </button>
            <button class="btn-icon" onclick="roleManager.editRole('${t.roleId}')" title="수정">
              <span class="icon">✏️</span>
            </button>
            ${t.active?`
              <button class="btn-icon" onclick="roleManager.deactivateRole('${t.roleId}')" title="휴직">
                <span class="icon">😴</span>
              </button>
            `:`
              <button class="btn-icon" onclick="roleManager.activateRole('${t.roleId}')" title="재고용">
                <span class="icon">✅</span>
              </button>
            `}
            <button class="btn-icon btn-danger" onclick="roleManager.deleteRole('${t.roleId}')" title="퇴사">
              <span class="icon">🗑️</span>
            </button>
          </div>
        </div>

        <p class="role-description">${t.description}</p>

        <div class="role-stats">
          <div class="stat-item">
            <span class="stat-label">사용</span>
            <span class="stat-value">${t.stats.usageCount||0}회</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">성공률</span>
            <span class="stat-value">${(t.stats.successRate||0).toFixed(1)}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">최근 사용</span>
            <span class="stat-value">${this.formatDate(t.stats.lastUsed)}</span>
          </div>
        </div>

        <div class="role-triggers">
          <span class="triggers-label">트리거:</span>
          ${t.triggers.slice(0,5).map(s=>`<span class="trigger-tag">${s}</span>`).join("")}
          ${t.triggers.length>5?`<span class="trigger-tag">+${t.triggers.length-5}</span>`:""}
        </div>
      </div>
    `).join("")}updateStats(){const e=this.roles.length,t=this.roles.filter(d=>d.active).length,s=this.roles.reduce((d,l)=>d+(l.stats.usageCount||0),0),n=e>0?this.roles.reduce((d,l)=>d+(l.stats.successRate||0),0)/e:0,a=document.getElementById("totalRoles"),i=document.getElementById("activeRoles"),o=document.getElementById("totalUsage"),r=document.getElementById("avgSuccessRate");a&&(a.textContent=e),i&&(i.textContent=t),o&&(o.textContent=s),r&&(r.textContent=n.toFixed(1)+"%")}async viewRole(e){try{const t=await this.apiClient.get(`/roles/${e}`);t.success&&this.showRoleDetail(t.role)}catch(t){console.error("역할 조회 실패:",t),this.showError("역할 정보를 불러오는데 실패했습니다.")}}showRoleDetail(e){const t=document.createElement("div");t.className="modal-overlay",t.innerHTML=`
      <div class="modal role-detail-modal">
        <div class="modal-header">
          <h2>${e.name}</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-content">
          <div class="detail-section">
            <h3>기본 정보</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">역할 ID:</span>
                <span class="value">${e.roleId}</span>
              </div>
              <div class="detail-item">
                <span class="label">카테고리:</span>
                <span class="value">${this.getCategoryLabel(e.category)}</span>
              </div>
              <div class="detail-item">
                <span class="label">생성자:</span>
                <span class="value">${e.createdBy}</span>
              </div>
              <div class="detail-item">
                <span class="label">상태:</span>
                <span class="value">${e.active?"활성":"비활성"}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>설명</h3>
            <p>${e.description}</p>
          </div>

          <div class="detail-section">
            <h3>AI 설정</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">우선 모델:</span>
                <span class="value">${e.preferredModel}</span>
              </div>
              <div class="detail-item">
                <span class="label">폴백 모델:</span>
                <span class="value">${e.fallbackModel}</span>
              </div>
              <div class="detail-item">
                <span class="label">최대 토큰:</span>
                <span class="value">${e.maxTokens}</span>
              </div>
              <div class="detail-item">
                <span class="label">온도:</span>
                <span class="value">${e.temperature}</span>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>시스템 프롬프트</h3>
            <pre class="system-prompt">${e.systemPrompt}</pre>
          </div>

          <div class="detail-section">
            <h3>트리거 키워드</h3>
            <div class="triggers-list">
              ${e.triggers.map(s=>`<span class="trigger-tag">${s}</span>`).join("")}
            </div>
          </div>

          <div class="detail-section">
            <h3>성능 통계</h3>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value-large">${e.stats.usageCount||0}</div>
                <div class="stat-label">사용 횟수</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${e.stats.successCount||0}</div>
                <div class="stat-label">성공</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${e.stats.failureCount||0}</div>
                <div class="stat-label">실패</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${(e.stats.successRate||0).toFixed(1)}%</div>
                <div class="stat-label">성공률</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${(e.stats.averageResponseTime||0).toFixed(0)}ms</div>
                <div class="stat-label">평균 응답시간</div>
              </div>
              <div class="stat-box">
                <div class="stat-value-large">${e.stats.totalTokensUsed||0}</div>
                <div class="stat-label">총 토큰</div>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <h3>메타데이터</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">생성일:</span>
                <span class="value">${new Date(e.createdAt).toLocaleString("ko-KR")}</span>
              </div>
              <div class="detail-item">
                <span class="label">수정일:</span>
                <span class="value">${new Date(e.updatedAt).toLocaleString("ko-KR")}</span>
              </div>
              <div class="detail-item">
                <span class="label">최근 사용:</span>
                <span class="value">${e.stats.lastUsed?new Date(e.stats.lastUsed).toLocaleString("ko-KR"):"사용 안됨"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,document.body.appendChild(t)}showCreateForm(){const e=document.createElement("div");e.className="modal-overlay",e.innerHTML=`
      <div class="modal role-form-modal">
        <div class="modal-header">
          <h2>➕ 새 역할 고용</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <form class="modal-content role-form" id="createRoleForm">
          <div class="form-group">
            <label>역할 ID *</label>
            <input type="text" name="roleId" required placeholder="예: content_writer">
            <small>영문 소문자, 숫자, 언더스코어만 사용</small>
          </div>

          <div class="form-group">
            <label>이름 *</label>
            <input type="text" name="name" required placeholder="예: 콘텐츠 작가">
          </div>

          <div class="form-group">
            <label>설명 *</label>
            <textarea name="description" required placeholder="이 역할이 하는 일을 설명하세요"></textarea>
          </div>

          <div class="form-group">
            <label>카테고리 *</label>
            <select name="category" required>
              <option value="content">콘텐츠</option>
              <option value="code">코드</option>
              <option value="data">데이터</option>
              <option value="creative">크리에이티브</option>
              <option value="technical">기술</option>
              <option value="other">기타</option>
            </select>
          </div>

          <div class="form-group">
            <label>트리거 키워드 *</label>
            <input type="text" name="triggers" required placeholder="쉼표로 구분: 작성, 글쓰기, 콘텐츠">
            <small>이 키워드가 포함되면 역할이 감지됩니다</small>
          </div>

          <div class="form-group">
            <label>시스템 프롬프트 *</label>
            <textarea name="systemPrompt" required rows="5" placeholder="당신은 전문 콘텐츠 작가입니다..."></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>우선 모델</label>
              <select name="preferredModel">
                <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 (권장, 가장 저렴)</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
              </select>
            </div>

            <div class="form-group">
              <label>온도 (0-2)</label>
              <input type="number" name="temperature" step="0.1" min="0" max="2" value="0.7">
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">취소</button>
            <button type="submit" class="btn btn-primary">고용하기</button>
          </div>
        </form>
      </div>
    `,document.body.appendChild(e),document.getElementById("createRoleForm").addEventListener("submit",async t=>{t.preventDefault(),await this.createRole(new FormData(t.target)),e.remove()})}async createRole(e){const t={roleId:e.get("roleId"),name:e.get("name"),description:e.get("description"),category:e.get("category"),systemPrompt:e.get("systemPrompt"),preferredModel:e.get("preferredModel"),temperature:parseFloat(e.get("temperature")),triggers:e.get("triggers").split(",").map(s=>s.trim()).filter(s=>s),createdBy:"user"};try{(await this.apiClient.post("/roles",t)).success&&(this.showSuccess(`${t.name} 역할을 성공적으로 고용했습니다!`),await this.loadRoles())}catch(s){console.error("역할 생성 실패:",s),this.showError("역할 생성에 실패했습니다.")}}async deactivateRole(e){if(confirm("이 역할을 휴직 처리하시겠습니까?"))try{const t=await this.apiClient.delete(`/roles/${e}`);t.success&&(this.showSuccess(t.message),await this.loadRoles())}catch(t){console.error("역할 비활성화 실패:",t),this.showError("역할 비활성화에 실패했습니다.")}}async activateRole(e){try{const t=await this.apiClient.post(`/roles/${e}/activate`);t.success&&(this.showSuccess(t.message),await this.loadRoles())}catch(t){console.error("역할 활성화 실패:",t),this.showError("역할 활성화에 실패했습니다.")}}async deleteRole(e){if(confirm("이 역할을 완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."))try{const t=await this.apiClient.delete(`/roles/${e}?permanent=true`);t.success&&(this.showSuccess(t.message),await this.loadRoles())}catch(t){console.error("역할 삭제 실패:",t),this.showError("역할 삭제에 실패했습니다.")}}async runAutoManage(){try{const e=await this.apiClient.post("/roles/auto-manage");e.success&&this.showAutoManageResults(e.results,e.summary)}catch(e){console.error("자동 최적화 실패:",e),this.showError("자동 최적화에 실패했습니다.")}}showAutoManageResults(e,t){const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
      <div class="modal auto-manage-modal">
        <div class="modal-header">
          <h2>⚡ 자동 최적화 결과</h2>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-content">
          <div class="summary-stats">
            <div class="summary-item">
              <span class="value">${t.totalRoles}</span>
              <span class="label">전체 역할</span>
            </div>
            <div class="summary-item">
              <span class="value">${t.needsOptimization}</span>
              <span class="label">개선 필요</span>
            </div>
            <div class="summary-item">
              <span class="value">${t.inactiveRoles}</span>
              <span class="label">비활성 고려</span>
            </div>
          </div>

          ${e.optimized.length>0?`
            <div class="result-section">
              <h3>🔧 개선이 필요한 역할</h3>
              ${e.optimized.map(n=>`
                <div class="result-card warning">
                  <h4>${n.name}</h4>
                  <p>문제: ${n.issue}</p>
                  <p>성공률: ${n.successRate.toFixed(1)}% (사용: ${n.usageCount}회)</p>
                  <p class="recommendation">💡 ${n.recommendation}</p>
                </div>
              `).join("")}
            </div>
          `:""}

          ${e.deactivated.length>0?`
            <div class="result-section">
              <h3>😴 비활성화 고려 대상</h3>
              ${e.deactivated.map(n=>`
                <div class="result-card info">
                  <h4>${n.name}</h4>
                  <p>${n.daysSinceUse}일 동안 사용 안됨</p>
                  <p class="recommendation">💡 ${n.recommendation}</p>
                </div>
              `).join("")}
            </div>
          `:""}

          ${e.optimized.length===0&&e.deactivated.length===0?`
            <div class="empty-state">
              <p>✅ 모든 역할이 정상 상태입니다!</p>
            </div>
          `:""}
        </div>
      </div>
    `,document.body.appendChild(s)}getCategoryLabel(e){return{content:"콘텐츠",code:"코드",data:"데이터",creative:"크리에이티브",technical:"기술",other:"기타"}[e]||e}formatDate(e){if(!e)return"사용 안됨";const t=new Date(e),n=new Date-t,a=Math.floor(n/(1e3*60*60*24));return a===0?"오늘":a===1?"어제":a<7?`${a}일 전`:a<30?`${Math.floor(a/7)}주 전`:`${Math.floor(a/30)}개월 전`}showSuccess(e){alert(e)}showError(e){alert(e)}editRole(e){alert("역할 수정 기능은 곧 구현됩니다.")}}let x=null;function F(m){return x=new D(m),window.roleManager=x,x}class O{constructor(e){this.apiClient=e,this.searchInput=null,this.resultsContainer=null,this.debounceTimer=null,this.debounceDelay=300,this.isSearching=!1,this.lastSearchResults=[]}init(){if(this.searchInput=document.querySelector(".search-input"),!this.searchInput){console.warn("검색 입력창을 찾을 수 없습니다.");return}this.createResultsDropdown(),this.setupEventListeners(),console.log("✅ SearchManager 초기화 완료")}createResultsDropdown(){const e=this.searchInput.closest(".search-box");if(!e)return;const t=e.querySelector(".search-results-dropdown");t&&t.remove(),this.resultsContainer=document.createElement("div"),this.resultsContainer.className="search-results-dropdown",this.resultsContainer.style.display="none",e.appendChild(this.resultsContainer)}setupEventListeners(){this.searchInput.addEventListener("input",e=>{const t=e.target.value.trim();if(clearTimeout(this.debounceTimer),!t){this.hideResults();return}this.debounceTimer=setTimeout(()=>{this.search(t)},this.debounceDelay)}),this.searchInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const t=this.searchInput.value.trim();t&&(clearTimeout(this.debounceTimer),this.search(t))}else e.key==="Escape"&&(this.hideResults(),this.searchInput.blur())}),this.searchInput.addEventListener("blur",()=>{setTimeout(()=>{this.hideResults()},200)}),this.searchInput.addEventListener("focus",()=>{this.searchInput.value.trim()&&this.resultsContainer.children.length>0&&this.showResults()})}async search(e){if(!(this.isSearching||!e)){this.isSearching=!0,this.showLoading();try{const t=await this.apiClient.smartSearch(e,{limit:10,includeMemory:!0});t&&t.results?this.renderResults(t.results,e):this.renderNoResults(e)}catch(t){console.error("검색 실패:",t),this.renderError(t.message)}finally{this.isSearching=!1}}}showLoading(){this.resultsContainer&&(this.resultsContainer.innerHTML=`
      <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <span>검색 중...</span>
      </div>
    `,this.showResults())}renderResults(e,t){if(!this.resultsContainer)return;if(!e||e.length===0){this.renderNoResults(t);return}this.lastSearchResults=e;const s=e.map(n=>this.renderResultItem(n,t)).join("");this.resultsContainer.innerHTML=`
      <div class="search-results-header">
        <span class="search-results-count">${e.length}개의 결과</span>
      </div>
      <div class="search-results-list">
        ${s}
      </div>
    `,this.resultsContainer.querySelectorAll(".search-result-item").forEach(n=>{n.addEventListener("click",()=>{const a=n.dataset.id,i=n.dataset.type;this.handleResultClick(a,i)})}),this.showResults()}renderResultItem(e,t){const s=e.topics||[],n=this.highlightText(s[0]||e.category||"제목 없음",t),a=s.slice(1).join(", "),i=this.highlightText(this.truncateText(a||e.category||"",100),t),o=e.date?this.formatDate(e.date):"",r=e.tags||[];return`
      <div class="search-result-item" data-id="${e.id}" data-type="memory">
        <div class="search-result-header">
          <span class="search-result-type memory">메모리</span>
          <span class="search-result-date">${o}</span>
        </div>
        <div class="search-result-title">${n}</div>
        ${i?`<div class="search-result-preview">${i}</div>`:""}
        ${r.length>0?`
          <div class="search-result-tags">
            ${r.slice(0,3).map(u=>`<span class="search-tag">${u}</span>`).join("")}
          </div>
        `:""}
      </div>
    `}highlightText(e,t){if(!t||!e)return e;const s=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),n=new RegExp(`(${s})`,"gi");return e.replace(n,'<mark class="search-highlight">$1</mark>')}truncateText(e,t){return e?e.length<=t?e:e.substring(0,t)+"...":""}formatDate(e){try{const t=new Date(e),n=new Date-t,a=Math.floor(n/(1e3*60*60*24));return a===0?"오늘":a===1?"어제":a<7?`${a}일 전`:t.toLocaleDateString("ko-KR",{year:"numeric",month:"short",day:"numeric"})}catch{return e}}renderNoResults(e){this.resultsContainer&&(this.resultsContainer.innerHTML=`
      <div class="search-no-results">
        <svg class="search-no-results-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <p>"${e}"에 대한 검색 결과가 없습니다.</p>
      </div>
    `,this.showResults())}renderError(e){this.resultsContainer&&(this.resultsContainer.innerHTML=`
      <div class="search-error">
        <svg class="search-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>검색 중 오류가 발생했습니다.</p>
        <span class="search-error-detail">${e}</span>
      </div>
    `,this.showResults())}async handleResultClick(e,t){var n;console.log(`검색 결과 클릭: ${t} - ${e}`),this.resultsContainer.querySelector(`[data-id="${e}"]`);const s=(n=this.lastSearchResults)==null?void 0:n.find(a=>a.id===e);this.hideResults(),this.searchInput.value="",t==="memory"&&s?this.showMemoryInCanvas(s):console.log("대화 로드 기능은 추후 구현 예정")}showMemoryInCanvas(e){var r;const t=document.getElementById("canvasPanel"),s=t==null?void 0:t.querySelector(".canvas-content"),n=t==null?void 0:t.querySelector(".canvas-header h3");if(!t||!s)return;t.classList.remove("hide");const a=((r=e.topics)==null?void 0:r[0])||e.category||"메모리",i=e.topics||[],o=e.tags||[];n&&(n.textContent=a),s.innerHTML=`
      <div class="memory-detail">
        <div class="memory-detail-meta">
          <span class="memory-detail-date">${this.formatDate(e.date)}</span>
          ${o.length>0?`
            <div class="memory-detail-tags">
              ${o.map(d=>`<span class="memory-tag">${d}</span>`).join("")}
            </div>
          `:""}
        </div>
        ${e.category?`
          <div style="margin-bottom: 12px;">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">카테고리:</span>
            <span style="font-size: 13px; color: #a5b4fc;">${e.category}</span>
          </div>
        `:""}
        ${i.length>0?`
          <div class="memory-detail-content">
            <h4 style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 8px;">주제</h4>
            <ul style="margin: 0; padding-left: 20px; color: #e8e8e8;">
              ${i.map(d=>`<li style="margin-bottom: 4px;">${d}</li>`).join("")}
            </ul>
          </div>
        `:""}
        ${e.importance?`
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">중요도:</span>
            <span style="font-size: 13px; color: #fcd34d;">${"★".repeat(e.importance)}${"☆".repeat(5-e.importance)}</span>
          </div>
        `:""}
      </div>
    `}showResults(){this.resultsContainer&&(this.resultsContainer.style.display="block")}hideResults(){this.resultsContainer&&(this.resultsContainer.style.display="none")}}class L{constructor(){this.themeManager=null,this.chatManager=null,this.panelManager=null,this.menuManager=null,this.apiClient=null,this.searchManager=null,this.elements={hamburgerBtn:document.getElementById("hamburgerBtn"),closeMenuBtn:document.getElementById("closeMenuBtn"),mainMenu:document.getElementById("mainMenu"),subMenu:document.getElementById("subMenu"),subMenuResizer:document.getElementById("subMenuResizer"),menuOverlay:document.getElementById("menuOverlay"),mainMenuItems:document.querySelectorAll(".main-menu-item"),chatForm:document.getElementById("chatForm"),messageInput:document.getElementById("messageInput"),sendBtn:document.getElementById("sendBtn"),messagesArea:document.getElementById("messagesArea"),rightPanel:document.getElementById("rightPanel"),closePanelBtn:document.getElementById("closePanelBtn"),panelTitle:document.getElementById("panelTitle"),panelContent:document.getElementById("panelContent"),chatContainer:document.getElementById("chatContainer"),toggleRightPanelBtn:document.getElementById("toggleRightPanelBtn"),canvasPanel:document.getElementById("canvasPanel"),closeCanvasPanelBtn:document.getElementById("closeCanvasPanelBtn"),testBoxToggleBtn:document.getElementById("testBoxToggleBtn"),dockTestArea:document.querySelector(".dock-test-area")},this.resizerState={isResizing:!1,startX:0,startWidth:0}}async init(){console.log("🌟 Soul UI 초기화 시작..."),this.apiClient=new q("/api"),this.themeManager=new B,this.chatManager=new z(this.apiClient),this.panelManager=new R(this.apiClient),this.menuManager=new H,this.roleManager=F(this.apiClient),await this.loadUserProfile(),this.setupEventListeners(),await this.chatManager.loadRecentMessages(),this.chatManager.bindExistingMessages(),this.scrollToBottom(),await k.init(),this.searchManager=new O(this.apiClient),this.searchManager.init(),console.log("✅ Soul UI 초기화 완료!")}async loadUserProfile(){try{const e="sowon";this.themeManager.setUserId(e);const t=await this.apiClient.getUserProfile(e);if(t&&t.preferences){const s=t.preferences.theme||{};await this.themeManager.applyTheme(s.skin||"default"),await this.themeManager.setFontSize(s.fontSize||"md"),s.glassEnabled!==void 0&&await this.themeManager.setGlassEffect(s.glassEnabled,{opacity:s.glassOpacity,blur:s.glassBlur}),s.backgroundImage&&this.themeManager.setBackgroundImage(s.backgroundImage,{opacity:s.backgroundOpacity,blur:s.backgroundBlur})}await this.loadProfileImage(e)}catch(e){console.warn("사용자 프로필 로드 실패:",e),this.themeManager.setUserId("sowon"),await this.themeManager.applyTheme("default")}}async loadProfileImage(e){var t,s,n,a;try{const o=await(await fetch(`/api/profile/p?userId=${e}`)).json();if(o.success&&o.profile){const r=o.profile;if(r.profileImage){const c=document.querySelector(".profile-section .avatar");c&&(c.style.backgroundImage=`url(${r.profileImage})`,c.style.backgroundSize="cover",c.style.backgroundPosition="center")}const d=document.querySelector(".profile-section .user-name");d&&((s=(t=r.basicInfo)==null?void 0:t.name)!=null&&s.value)&&(d.textContent=r.basicInfo.name.value);const l=document.querySelector(".profile-section .user-email");l&&((a=(n=r.basicInfo)==null?void 0:n.email)!=null&&a.value)&&(l.textContent=r.basicInfo.email.value),console.log("✅ 프로필 정보 로드 완료")}}catch(i){console.warn("프로필 정보 로드 실패:",i)}}setupEventListeners(){this.elements.hamburgerBtn&&this.elements.hamburgerBtn.addEventListener("click",()=>this.toggleMenu()),this.elements.closeMenuBtn&&this.elements.closeMenuBtn.addEventListener("click",()=>this.closeMenu()),this.elements.menuOverlay&&this.elements.menuOverlay.addEventListener("click",()=>this.closeMenu()),this.elements.mainMenuItems&&this.elements.mainMenuItems.length>0&&this.elements.mainMenuItems.forEach(l=>{l.addEventListener("click",c=>{c.preventDefault();const u=l.dataset.menu;u&&this.menuManager.switchMenu(u)})}),this.elements.closePanelBtn&&this.elements.closePanelBtn.addEventListener("click",()=>this.closePanel()),this.elements.toggleRightPanelBtn?(console.log("✅ Canvas 토글 버튼 등록"),this.elements.toggleRightPanelBtn.addEventListener("click",()=>{console.log("🖱️ Canvas 토글 버튼 클릭"),this.toggleCanvasPanel()})):console.log("❌ Canvas 토글 버튼을 찾을 수 없음"),this.elements.closeCanvasPanelBtn?(console.log("✅ Canvas 닫기 버튼 등록"),this.elements.closeCanvasPanelBtn.addEventListener("click",()=>{console.log("🖱️ Canvas 닫기 버튼 클릭"),this.toggleCanvasPanel()})):console.log("❌ Canvas 닫기 버튼을 찾을 수 없음"),this.elements.testBoxToggleBtn?(console.log("✅ 독 토글 버튼 등록"),this.elements.testBoxToggleBtn.addEventListener("click",()=>{console.log("🖱️ 독 토글 버튼 클릭"),this.toggleDock()})):console.log("❌ 독 토글 버튼을 찾을 수 없음");const e=document.querySelector('.attach-btn[title="MCP"]');e?(console.log("✅ 입력창 MCP 버튼 등록"),e.addEventListener("click",async l=>{l.preventDefault(),console.log("🖱️ 입력창 MCP 버튼 클릭"),await this.showMCPManager()})):console.log("❌ 입력창 MCP 버튼을 찾을 수 없음");const t=document.getElementById("profileSection");t?(console.log("✅ 설정 섹션 클릭 이벤트 등록 (왼쪽 베이지 레이어)"),t.addEventListener("click",async()=>{console.log("🖱️ 설정 섹션 클릭 - 설정 페이지 로드");const l=document.querySelector(".dashboard"),c=document.querySelector(".add-page-btn"),u=document.querySelector(".profile-section");if(l){l.style.display="none",c&&(c.style.display="none"),u&&(u.style.display="none");let p=document.getElementById("settingsContainer");p?p.style.display="flex":(p=document.createElement("div"),p.id="settingsContainer",p.className="settings-wrapper",p.style.cssText="padding: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;",l.parentElement.appendChild(p)),p.innerHTML="";const g=document.createElement("div");g.style.cssText="flex: 1; min-height: 0; overflow-y: auto;",g.classList.add("settings-content-wrapper"),p.appendChild(g);const h=document.createElement("button");h.innerHTML="← 대시보드로",h.style.cssText="margin: 0; padding: 0.4rem 0.75rem; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 0.375rem; color: white; cursor: pointer; font-size: 0.75rem; width: 100%;",h.onclick=()=>{l.style.display="block",p.style.display="none",c&&(c.style.display="block"),u&&(u.style.display="flex")},p.appendChild(h);const{SettingsManager:f}=await M(async()=>{const{SettingsManager:S}=await import("./settings-manager-BooauTof.js");return{SettingsManager:S}},[]);await new f(this.apiClient).render(g,"profile")}})):console.log("❌ 설정 섹션을 찾을 수 없음"),this.initCenterMenuButtons();const s=document.getElementById("mobileMenuBtn"),n=document.querySelector(".left-card"),a=document.querySelector(".center-group"),i=document.getElementById("mobileOverlay");s&&n&&a?(console.log("✅ 모바일 메뉴 버튼 등록"),s.addEventListener("click",()=>{console.log("🖱️ 모바일 메뉴 버튼 클릭"),n.classList.toggle("hide"),a.classList.toggle("hide")}),i&&i.addEventListener("click",()=>{n.classList.add("hide"),a.classList.add("hide")})):console.log("❌ 모바일 메뉴 요소를 찾을 수 없음");const o=document.getElementById("scrollToBottom"),r=document.querySelector(".right-card-top");o&&r?(console.log("✅ 스크롤 버튼 및 컨테이너 등록"),r.addEventListener("scroll",()=>{const l=r.scrollTop,c=r.scrollHeight,u=r.clientHeight;c-l-u>100?o.classList.add("show"):o.classList.remove("show")}),o.addEventListener("click",()=>{console.log("🖱️ 스크롤 하단 버튼 클릭"),r.scrollTo({top:r.scrollHeight,behavior:"smooth"})})):console.log("❌ 스크롤 버튼 또는 컨테이너를 찾을 수 없음");const d=document.getElementById("canvasResizer");if(d&&this.elements.canvasPanel){let l=!1,c=0,u=0;d.addEventListener("mousedown",p=>{l=!0,c=p.clientX,u=this.elements.canvasPanel.offsetWidth,d.classList.add("resizing"),document.body.style.cursor="col-resize",document.body.style.userSelect="none"}),document.addEventListener("mousemove",p=>{if(!l)return;const g=c-p.clientX;let h=250,f=500;window.innerWidth<=900?(h=150,f=400):window.innerWidth<=1200&&(h=200,f=450);const w=Math.max(h,Math.min(f,u+g));this.elements.canvasPanel.style.width=w+"px"}),document.addEventListener("mouseup",()=>{l&&(l=!1,d.classList.remove("resizing"),document.body.style.cursor="",document.body.style.userSelect="")})}if(this.initWidgetClock(),this.initResponsive(),this.initMacosDock(),this.elements.chatForm&&this.elements.messageInput){this.elements.chatForm.addEventListener("submit",c=>{c.preventDefault(),this.sendMessage()});let l=!1;this.elements.messageInput.addEventListener("keydown",c=>{c.key==="Enter"&&!c.shiftKey&&!l&&(c.preventDefault(),this.sendMessage())}),this.elements.messageInput.addEventListener("input",()=>{this.autoResizeTextarea(),this.updateSendButton()}),this.elements.messageInput.addEventListener("compositionstart",c=>{l=!0,c.target.style.fontWeight="400"}),this.elements.messageInput.addEventListener("compositionupdate",c=>{c.target.style.fontWeight="400"}),this.elements.messageInput.addEventListener("compositionend",c=>{l=!1,c.target.style.fontWeight="400"})}document.addEventListener("keydown",l=>{l.key==="Escape"&&(this.elements.mainMenu&&this.elements.mainMenu.classList.contains("open")&&this.closeMenu(),this.elements.rightPanel&&this.elements.rightPanel.classList.contains("open")&&this.closePanel())}),this.elements.mainMenu&&this.elements.mainMenu.addEventListener("scroll",l=>{l.stopPropagation()}),this.elements.subMenu&&this.elements.subMenu.addEventListener("scroll",l=>{l.stopPropagation()}),this.elements.rightPanel&&this.elements.rightPanel.addEventListener("scroll",l=>{l.stopPropagation()}),this.elements.subMenuResizer&&this.elements.subMenuResizer.addEventListener("mousedown",l=>{this.startResize(l)}),document.addEventListener("mousemove",l=>{this.resizerState.isResizing&&this.doResize(l)}),document.addEventListener("mouseup",()=>{this.resizerState.isResizing&&this.stopResize()})}toggleMenu(){this.elements.mainMenu.classList.contains("open")?this.closeMenu():this.menuManager.open()}closeMenu(){this.menuManager.close()}openPanel(e){this.panelManager.openPanel(e),this.elements.rightPanel.classList.add("open"),this.elements.chatContainer.classList.add("panel-open")}closePanel(){this.elements.rightPanel.classList.remove("open"),this.elements.chatContainer.classList.remove("panel-open"),this.panelManager.closePanel()}toggleCanvasPanel(){if(console.log("🔄 toggleCanvasPanel 호출"),this.elements.canvasPanel){const e=this.elements.canvasPanel.classList.contains("hide");this.elements.canvasPanel.classList.toggle("hide"),console.log(`Canvas 패널: ${e?"열림":"닫힘"}`)}else console.log("❌ canvasPanel 요소 없음")}closeCanvasPanel(){this.elements.canvasPanel&&this.elements.canvasPanel.classList.add("hide")}toggleDock(){console.log("🔄 toggleDock 호출"),this.elements.dockTestArea?this.elements.dockTestArea.style.display==="none"?(this.elements.dockTestArea.style.display="flex",console.log("독 표시")):(this.elements.dockTestArea.style.display="none",console.log("독 숨김")):console.log("❌ dockTestArea 요소 없음")}initWidgetClock(){const e=document.getElementById("hourTens"),t=document.getElementById("hourOnes"),s=document.getElementById("minuteTens"),n=document.getElementById("minuteOnes"),a=document.getElementById("calendarWeekday"),i=document.getElementById("calendarMonth"),o=document.getElementById("calendarDay");if(!e||!t||!s||!n||!a||!i||!o){console.log("시계 위젯 요소를 찾을 수 없습니다.");return}const r=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],d=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],l=()=>{const c=new Date,u=String(c.getHours()).padStart(2,"0"),p=String(c.getMinutes()).padStart(2,"0");e.textContent=u[0],t.textContent=u[1],s.textContent=p[0],n.textContent=p[1];const g=r[c.getDay()],h=d[c.getMonth()],f=c.getDate();a.textContent=g,i.textContent=h,o.textContent=f};l(),setInterval(l,1e3)}initResponsive(){const e=document.querySelector(".left-card"),t=document.querySelector(".center-group");window.innerWidth<900?(e==null||e.classList.add("hide"),t==null||t.classList.add("hide")):(e==null||e.classList.remove("hide"),t==null||t.classList.remove("hide"));let n=window.innerWidth;window.addEventListener("resize",()=>{const a=window.innerWidth,i=n<900,o=a<900;i!==o&&(o?(e==null||e.classList.add("hide"),t==null||t.classList.add("hide")):(e==null||e.classList.remove("hide"),t==null||t.classList.remove("hide"))),n=a})}initCenterMenuButtons(){const e=document.querySelectorAll(".center-btn, .neo-btn");if(!e.length){console.log("❌ 가운데 메뉴 버튼을 찾을 수 없음");return}console.log("✅ 가운데 메뉴 버튼 등록:",e.length);const t=new Audio("http://data.tomazki.com/inSound.mp3"),s=new Audio("http://data.tomazki.com/outSound.mp3");[t,s].forEach(n=>{n.preload="auto",n.volume=.03}),e.forEach(n=>{n.addEventListener("click",async()=>{var i,o;const a=[...e].filter(r=>r!==n&&r.classList.contains("active"));n.classList.contains("active")?(n.classList.remove("active"),s.currentTime=0,s.play().catch(()=>{}),this.closeCanvasPanel()):(a.forEach(d=>d.classList.remove("active")),n.classList.add("active"),t.currentTime=0,t.play().catch(()=>{}),(((o=(i=n.querySelector("span"))==null?void 0:i.textContent)==null?void 0:o.trim())==="MCP"||n.classList.contains("neo-btn-3"))&&await this.showMCPManager())})})}async showMCPManager(){const e=this.elements.canvasPanel;if(!e)return;e.classList.remove("hide");const t=e.querySelector(".canvas-header h3"),s=e.querySelector(".canvas-content");if(t&&(t.textContent="MCP 서버"),s)try{const{MCPManager:n}=await M(async()=>{const{MCPManager:i}=await import("./mcp-manager-DvBdA_zw.js");return{MCPManager:i}},[]);await new n(this.apiClient).render(s)}catch(n){console.error("Failed to load MCP Manager:",n),s.innerHTML=`
          <div style="padding: 2rem; text-align: center; color: rgba(239, 68, 68, 0.9);">
            <p>MCP 관리자를 불러오는데 실패했습니다.</p>
            <p style="font-size: 0.875rem; opacity: 0.7;">${n.message}</p>
          </div>
        `}}async sendMessage(){const e=this.elements.messageInput.value.trim();if(e){if(this._isSending){console.log("⚠️ 중복 전송 차단");return}this._isSending=!0,this.elements.messageInput.value="",this.autoResizeTextarea(),this.updateSendButton();try{await this.chatManager.sendMessage(e)}finally{this._isSending=!1}}}autoResizeTextarea(){const e=this.elements.messageInput;e.style.height="auto";const t=Math.min(Math.max(e.scrollHeight,42),200);e.style.height=`${t}px`,e.scrollHeight>200?e.classList.add("has-scroll"):e.classList.remove("has-scroll")}updateSendButton(){const e=this.elements.messageInput.value.trim().length>0;this.elements.sendBtn.disabled=!e}scrollToBottom(){const e=document.querySelector(".right-card-top");e?(console.log("📜 초기 스크롤 하단 이동 시도"),e.scrollTop=e.scrollHeight,requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight,console.log("📜 스크롤 완료:",e.scrollTop)})):console.log("❌ 메시지 컨테이너를 찾을 수 없음")}startResize(e){this.resizerState.isResizing=!0,this.resizerState.startX=e.clientX,this.resizerState.startWidth=this.elements.subMenu.offsetWidth,this.elements.subMenu.classList.add("resizing"),this.elements.subMenuResizer.classList.add("resizing"),document.body.style.cursor="ew-resize",document.body.style.userSelect="none"}doResize(e){if(!this.resizerState.isResizing)return;const t=e.clientX-this.resizerState.startX,s=this.resizerState.startWidth+t,n=Math.min(Math.max(s,240),600);this.elements.subMenu.style.width=`${n}px`;const a=n+72;this.elements.subMenu.style.transform=this.elements.subMenu.classList.contains("open")?"translateX(0)":`translateX(-${a}px)`}stopResize(){this.resizerState.isResizing=!1,this.elements.subMenu.classList.remove("resizing"),this.elements.subMenuResizer.classList.remove("resizing"),document.body.style.cursor="",document.body.style.userSelect=""}initMacosDock(){const e=document.querySelector(".macos-dock"),t=document.querySelectorAll(".dock-item");if(!e||!t.length){console.log("❌ MacOS Dock 요소를 찾을 수 없음");return}console.log("✅ MacOS Dock 효과 등록");const s=120;e.addEventListener("mousemove",n=>{const a=e.getBoundingClientRect(),i=n.clientX-a.left;t.forEach(o=>{const r=o.getBoundingClientRect(),d=r.left+r.width/2-a.left,l=Math.abs(i-d);let c=1;if(l<s){const p=1-l/s;c=1+(1-Math.pow(1-p,2))*1.45}const u=-(c-1)*12;o.style.transform=`translateY(${u}px) scale(${c})`})}),e.addEventListener("mouseleave",()=>{t.forEach(n=>{n.style.transform="translateY(0) scale(1)"})})}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{const m=new L;m.init(),window.soulApp=m});else{const m=new L;m.init(),window.soulApp=m}export{M as _};
