let sections = {};
let currentTab = "";
let lastMdContent = "";

async function init() {
    await checkUpdate();
}

async function checkUpdate() {
    try {
        const res = await fetch(`/api/todo?t=${Date.now()}`);
        const text = await res.text();
        if (text !== lastMdContent) {
            lastMdContent = text;
            parseMarkdown(text.replace(/\/\*[\s\S]*?\*\//g, ""));
            const names = Object.keys(sections);
            if (!currentTab || !sections[currentTab]) currentTab = names[0];
            render();
        }
    } catch (e) { console.error("로드 실패", e); }
}

function parseMarkdown(text) {
    sections = {};
    const lines = text.split('\n');
    let activeTab = null;
    let rawLines = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('###')) {
            if (activeTab || rawLines.length > 0) finalize(activeTab || "Tasks", rawLines);
            activeTab = trimmed.replace(/^###\s*/, '').trim();
            rawLines = [];
        } else { rawLines.push(line); }
    });
    if (activeTab || rawLines.length > 0) finalize(activeTab || "Tasks", rawLines);
}

function finalize(name, lines) {
    if (!name) return;
    const isList = lines.some(l => /phase/i.test(l) || l.trim().startsWith('-'));
    if (isList) {
        const phases = [];
        let cur = null;
        lines.forEach(l => {
            const t = l.trim();
            if (!t) return;
            if (/^phase/i.test(t)) {
                cur = { title: t, items: [], isOpen: true };
                phases.push(cur);
            } else {
                if (!cur) { cur = { title: "General", items: [], isOpen: true }; phases.push(cur); }
                if (t.match(/^([A-Z0-9]+)(\.[A-Z0-9]+)+\s+(.+)/i)) cur.items.push({ type: 'sub', content: t });
                else if (t.startsWith("- [")) cur.items.push({ type: 'task', content: t.replace(/- \[[xX ]\]\s*/, ""), done: t.toLowerCase().includes("[x]") });
                else cur.items.push({ type: 'memo', content: t.replace(/^[*•-]\s*/, "").trim() });
            }
        });
        sections[name] = phases;
    } else { sections[name] = { type: 'raw', content: lines.join('\n').trim() }; }
}

async function autoSave() {
    let md = "";
    for (const [tabName, data] of Object.entries(sections)) {
        md += `### ${tabName}\n\n`;
        if (data.type === 'raw') { md += data.content + "\n\n"; }
        else {
            data.forEach(phase => {
                md += `${phase.title}\n`;
                phase.items.forEach(item => {
                    if (item.type === 'sub') md += `${item.content}\n`;
                    else if (item.type === 'task') md += `- [${item.done ? 'x' : ' '}] ${item.content}\n`;
                    else md += `* ${item.content}\n`;
                });
                md += "\n";
            });
        }
    }
    lastMdContent = md.trim();
    try {
        await fetch('/api/todo', {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: md.trim() || ""
        });
    } catch (e) {
        console.error("네트워크 오류:", e);
    }
}

function render() {
    const tabArea = document.getElementById('tabs-area');
    const contentArea = document.getElementById('content-area');
    const names = Object.keys(sections);
    tabArea.innerHTML = names.map(n => `<button class="tab-btn ${currentTab===n?'active':''}" onclick="setTab('${esc(n)}')">${esc(n)}</button>`).join('');
    const data = sections[currentTab];
    if (!data) return;

    if (data.type === 'raw') {
        contentArea.innerHTML = `<textarea class="server-editor" id="auto-text" oninput="autoHeight(this); updateRaw('${currentTab}', this.value)">${esc(data.content)}</textarea>`;
        setTimeout(() => autoHeight(document.getElementById('auto-text')), 10);
    } else {
        contentArea.innerHTML = data.map((p, pIdx) => {
            const tasks = p.items.filter(i => i.type === 'task');
            const doneCount = tasks.filter(t => t.done).length;
            let badge = `<span class="status-badge status-todo">Waiting</span>`;
            if (doneCount > 0) badge = `<span class="status-badge status-doing">Doing (${doneCount}/${tasks.length})</span>`;
            if (tasks.length > 0 && doneCount === tasks.length) badge = `<span class="status-badge status-done">Complete</span>`;
            return `
            <div class="phase-card">
                <div class="phase-header">
                    <div class="phase-info" onclick="togglePhase(${pIdx})">
                        <input class="editable" style="font-weight:800; font-size:16px;" value="${esc(p.title)}" onchange="updatePhaseTitle(${pIdx}, this.value)">
                        ${badge}
                    </div>
                    <span class="btn-del" onclick="deletePhase(${pIdx})">×</span>
                </div>
                <div class="phase-body ${p.isOpen?'open':''}">
                    ${p.items.map((it, iIdx) => {
                        const del = `<span class="btn-del" onclick="deleteItem(${pIdx},${iIdx})">×</span>`;
                        if (it.type === 'sub') return `<div class="sub-title-row"><input class="sub-title" value="${esc(it.content)}" onchange="updateItem(${pIdx},${iIdx},this.value)">${del}</div>`;
                        if (it.type === 'task') return `<div class="item-row"><div class="checkbox ${it.done?'done':''}" onclick="toggleTask(${pIdx},${iIdx})">${it.done?'✓':''}</div><input class="editable" value="${esc(it.content)}" onchange="updateItem(${pIdx},${iIdx},this.value)" onkeydown="handleKey(event,${pIdx},${iIdx})">${del}</div>`;
                        return `<div class="item-row memo-row"><span class="memo-bullet">•</span><input class="editable" value="${esc(it.content)}" onchange="updateItem(${pIdx},${iIdx},this.value)" onkeydown="handleKey(event,${pIdx},${iIdx})">${del}</div>`;
                    }).join('')}
                    <div style="display:flex; gap:10px;"><button class="add-btn" onclick="addItem(${pIdx}, 'task')">+ Task</button><button class="add-btn" onclick="addItem(${pIdx}, 'sub')">+ SubTitle</button></div>
                </div>
            </div>`;
        }).join('');
    }
    updateProg();
}

function esc(t) { return t ? t.replace(/"/g, "&quot;").replace(/'/g, "&#39;") : ""; }
window.setTab = (n) => { currentTab = n; render(); };
window.togglePhase = (idx) => { sections[currentTab][idx].isOpen = !sections[currentTab][idx].isOpen; render(); };
window.updatePhaseTitle = (pIdx, val) => { sections[currentTab][pIdx].title = val; autoSave(); };
window.deletePhase = (pIdx) => { if(confirm("Phase를 삭제할까?")) { sections[currentTab].splice(pIdx, 1); render(); autoSave(); } };
window.toggleTask = (pIdx, iIdx) => { sections[currentTab][pIdx].items[iIdx].done = !sections[currentTab][pIdx].items[iIdx].done; render(); autoSave(); };
window.updateItem = (pIdx, iIdx, val) => { sections[currentTab][pIdx].items[iIdx].content = val; autoSave(); };
window.deleteItem = (pIdx, iIdx) => { sections[currentTab][pIdx].items.splice(iIdx, 1); render(); autoSave(); };
window.addItem = (pIdx, type) => { sections[currentTab][pIdx].items.push({ type: type, content: type==='sub'?'1.1 Title':'New Item', done: false }); render(); autoSave(); };
window.updateRaw = (tab, val) => { sections[tab].content = val; autoSave(); };
window.autoHeight = (el) => { if(!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
window.handleKey = (e, pIdx, iIdx) => {
    if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        sections[currentTab][pIdx].items.splice(iIdx + 1, 0, { type: 'memo', content: '' });
        render(); autoSave();
        setTimeout(() => document.querySelectorAll('.editable')[iIdx + 2]?.focus(), 10);
    }
};
window.forceUpdate = async function(e) {
    const btn = e.currentTarget;
    btn.innerText = "Updating...";
    await checkUpdate();
    setTimeout(() => { btn.innerText = "저장"; }, 500);
};

function updateProg() {
    const d = sections[currentTab];
    if (!d || d.type === 'raw') return;
    const tasks = d.flatMap(p => p.items.filter(i => i.type === 'task'));
    const pct = tasks.length ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0;
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('prog-text').innerText = pct + '%';
}

init();
