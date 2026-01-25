import{_ as c}from"./index-BKZIwKOh.js";class p{constructor(t){this.apiClient=t,this.currentPage=null,this.components=new Map}async render(t,n="profile"){t.innerHTML=`
      <div class="settings-container">
        <!-- 설정 네비게이션 -->
        <nav class="settings-nav">
          <button class="settings-nav-item" data-page="profile">
            <span class="nav-icon">👤</span>
            <span class="nav-label">프로필</span>
          </button>
          <button class="settings-nav-item" data-page="ai">
            <span class="nav-icon">🤖</span>
            <span class="nav-label">AI 설정</span>
          </button>
          <button class="settings-nav-item" data-page="theme">
            <span class="nav-icon">🎨</span>
            <span class="nav-label">테마</span>
          </button>
        </nav>

        <!-- 설정 컨텐츠 영역 -->
        <div class="settings-content" id="settingsContent"></div>
      </div>
    `,this.attachNavigation(t),await this.loadPage(n)}attachNavigation(t){const n=t.querySelectorAll(".settings-nav-item");n.forEach(a=>{a.addEventListener("click",async()=>{const i=a.dataset.page;await this.loadPage(i),n.forEach(o=>o.classList.remove("active")),a.classList.add("active")})});const s=t.querySelector(`[data-page="${this.currentPage||"profile"}"]`);s&&s.classList.add("active")}async loadPage(t){this.currentPage=t;const n=document.getElementById("settingsContent");if(n)try{await(await this.getComponent(t)).render(n,this.apiClient)}catch(s){console.error(`Failed to load settings page: ${t}`,s),n.innerHTML=`
        <div class="settings-error">
          <p>설정 페이지를 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; color: rgba(255,255,255,0.6);">${s.message}</p>
        </div>
      `}}async getComponent(t){if(this.components.has(t))return this.components.get(t);let n;switch(t){case"profile":const{ProfileSettings:a}=await c(async()=>{const{ProfileSettings:e}=await import("./profile-settings-BipSlhyg.js");return{ProfileSettings:e}},[]);n=a;break;case"ai":const{AISettings:i}=await c(async()=>{const{AISettings:e}=await import("./ai-settings-Cvxxnz-q.js");return{AISettings:e}},[]);n=i;break;case"theme":const{ThemeSettings:o}=await c(async()=>{const{ThemeSettings:e}=await import("./theme-settings-Bl9LoM2X.js");return{ThemeSettings:e}},[]);n=o;break;default:throw new Error(`Unknown page: ${t}`)}const s=new n;return this.components.set(t,s),s}}export{p as SettingsManager};
