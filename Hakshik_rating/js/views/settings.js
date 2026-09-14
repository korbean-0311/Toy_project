import { listCafeterias, saveCafeteria, deleteCafeteria } from '../lib/store.js';
import { currentPosition } from '../lib/geo.js';
import { getRole, isUploader, releaseDevice, ROLES } from '../lib/auth.js';
import { recompressAll } from '../lib/recompress.js';
import { MODES, getMode, setMode } from '../theme.js';
import { APP_VERSION, IMAGE_MAX_EDGE } from '../config.js';
import { esc, formatBytes } from '../lib/format.js';
import { setAppbar, spinner, errorBox, toast, go } from '../ui.js';

export default async function settings(root) {
  setAppbar('<div class="appbar-row"><span class="brand">⚙️ 설정</span></div>');
  root.innerHTML = spinner();

  let cafeterias;
  try {
    cafeterias = await listCafeterias();
  } catch (err) {
    root.innerHTML = errorBox(esc(err.message));
    return;
  }

  let editing = null; // 수정 중인 식당, 새로 추가면 null
  // 식당은 처음에 한 번 등록하고 나면 거의 안 건드리므로 폼은 접어둔다.
  // 수정을 누르면 그때 펼친다.
  let formOpen = false;

  render();

  function render() {
    const role = ROLES[getRole()];

    root.innerHTML = `
      <div class="pad">
        <section class="card">
          <h2 class="card-title">식당 위치</h2>
          <p class="card-desc">
            사진의 GPS가 등록한 좌표의 반경 안에 들어오면 그 식당으로 자동 매칭돼요.
            식당에 서 있을 때 <b>현재 위치 넣기</b>를 누르는 게 제일 정확합니다.
          </p>
          <ul class="rows" id="rows">
            ${
              cafeterias.length
                ? cafeterias.map(row).join('')
                : '<li class="row-empty">등록된 식당이 없어요.</li>'
            }
          </ul>
        </section>

        <section class="card">
          <button type="button" class="card-toggle" id="formToggle"
                  aria-expanded="${formOpen}" aria-controls="cafeForm">
            <span class="card-title">${editing ? '식당 수정' : '식당 추가'}</span>
            <span class="card-chevron" aria-hidden="true">▾</span>
          </button>
          <form class="form" id="cafeForm" ${formOpen ? '' : 'hidden'}>
            <label class="field">
              <span>이름</span>
              <input id="name" type="text" required maxlength="40"
                     value="${esc(editing?.name ?? '')}" placeholder="학생회관 식당" />
            </label>
            <label class="field">
              <span>동 <i>(선택)</i></span>
              <input id="building" type="text" maxlength="20"
                     value="${esc(editing?.building ?? '')}" placeholder="63동" />
            </label>
            <div class="field-pair">
              <label class="field">
                <span>위도</span>
                <input id="lat" type="number" step="any" required
                       value="${editing?.lat ?? ''}" placeholder="37.4592" />
              </label>
              <label class="field">
                <span>경도</span>
                <input id="lng" type="number" step="any" required
                       value="${editing?.lng ?? ''}" placeholder="126.9520" />
              </label>
            </div>
            <label class="field">
              <span>반경 (m)</span>
              <input id="radius" type="number" min="10" max="2000" step="10" required
                     value="${editing?.radius_m ?? 150}" />
            </label>

            <button class="btn btn-ghost btn-block" type="button" id="hereBtn">
              📍 현재 위치 넣기
            </button>
            <button class="btn btn-primary btn-block" type="submit">
              ${editing ? '수정 저장' : '추가'}
            </button>
            ${
              editing
                ? '<button class="btn btn-ghost btn-block" type="button" id="cancelBtn">취소</button>'
                : ''
            }
          </form>
        </section>

        <section class="card">
          <h2 class="card-title">화면</h2>
          <div class="seg seg-inline seg-wide" id="themeSeg">
            ${MODES.map(
              (m) =>
                `<button type="button" data-theme-mode="${m.id}"
                         class="${m.id === getMode() ? 'is-on' : ''}">${m.label}</button>`,
            ).join('')}
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">역할</h2>
          <p class="card-desc">
            이 기기가 <b>${role.emoji} ${role.label}</b> 자리를 잡고 있어요. 한 번에 기기 한 대만 쓸 수 있어요.
            놓아주면 PIN 화면으로 돌아가고, 다른 기기가 그 자리를 가져갈 수 있어요.
            <br />기기를 바꾸는 거라면 굳이 여기서 놓지 않아도 돼요 — 새 기기에서 PIN을 넣으면
            <b>이 기기로 옮기기</b>가 뜹니다.
          </p>
          <button class="btn btn-ghost btn-block danger" id="releaseBtn">이 기기에서 역할 놓기</button>
        </section>

        ${
          isUploader()
            ? `<section class="card">
                 <h2 class="card-title">사진 정리</h2>
                 <p class="card-desc">
                   압축 기준을 바꾸기 전에 올린 사진은 예전 크기 그대로예요.
                   지금 기준(긴 변 ${IMAGE_MAX_EDGE}px)으로 다시 구워서 덮어씁니다.
                   기록과 평가는 그대로 남고, 이미 작은 사진은 건드리지 않아요.
                 </p>
                 <button class="btn btn-ghost btn-block" id="recompressBtn">사진 다시 압축</button>
                 <p class="dim" id="recompressLog" hidden></p>
               </section>`
            : ''
        }

        <section class="card">
          <h2 class="card-title">앱</h2>
          <p class="card-desc">
            버전 <b>${esc(APP_VERSION)}</b><br />
            고친 게 반영이 안 된 것 같으면 아래를 누르세요. 브라우저가 쥐고 있는 옛 파일을
            버리고 새로 받아옵니다. <b>로그인은 그대로 유지돼요.</b>
          </p>
          <button class="btn btn-ghost btn-block" id="refreshBtn">새 버전 받기</button>
        </section>
      </div>`;

    bind();
  }

  function row(c) {
    return `
      <li class="row">
        <div class="row-main">
          <div class="row-name">${esc(c.name)}${c.building ? ` <i>${esc(c.building)}</i>` : ''}</div>
          <div class="row-sub">${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · 반경 ${c.radius_m}m</div>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost btn-xs" data-edit="${c.id}">수정</button>
          <button class="btn btn-ghost btn-xs danger" data-del="${c.id}">삭제</button>
        </div>
      </li>`;
  }

  function bind() {
    root.querySelector('#rows')?.addEventListener('click', async (e) => {
      const editId = e.target.closest('[data-edit]')?.dataset.edit;
      if (editId) {
        editing = cafeterias.find((c) => c.id === editId);
        formOpen = true; // 수정하려면 폼이 보여야 한다
        render();
        return;
      }

      const delId = e.target.closest('[data-del]')?.dataset.del;
      if (!delId) return;
      if (!confirm('이 식당을 지울까요? 이미 올린 기록의 식당 표시가 사라져요.')) return;

      try {
        await deleteCafeteria(delId);
        cafeterias = cafeterias.filter((c) => c.id !== delId);
        if (editing?.id === delId) {
          editing = null;
          formOpen = false;
        }
        toast('지웠어요');
        render();
      } catch (err) {
        toast(err.message, { error: true });
      }
    });

    root.querySelector('#recompressBtn')?.addEventListener('click', async (e) => {
      const log = root.querySelector('#recompressLog');
      e.target.disabled = true;
      log.hidden = false;
      log.textContent = '사진을 확인하는 중…';

      try {
        const r = await recompressAll(({ done, total }) => {
          log.textContent = `${total}장 중 ${done}장 처리했어요…`;
        });

        // 실패를 "할 게 없었다" 로 뭉뚱그리지 않는다 — 셋을 따로 적는다
        const parts = [];
        if (r.changed) parts.push(`${r.changed}장 다시 압축 (${formatBytes(r.saved)} 줄임)`);
        if (r.skipped) parts.push(`${r.skipped}장은 이미 작아서 그대로`);
        if (r.failed) parts.push(`⚠ ${r.failed}장 실패 — 사진은 안 지워졌어요`);
        log.textContent = r.total ? parts.join(' · ') : '올라온 사진이 없어요.';

        if (r.failed) toast(`${r.failed}장을 처리하지 못했어요`, { error: true });
        else if (r.changed) toast('사진을 정리했어요');
        else toast('정리할 사진이 없어요');
      } catch (err) {
        log.textContent = '';
        toast(err.message, { error: true });
      } finally {
        e.target.disabled = false;
      }
    });

    root.querySelector('#formToggle').addEventListener('click', () => {
      formOpen = !formOpen;
      if (!formOpen) editing = null; // 접으면 수정하던 것도 취소
      render();
    });

    // 이 페이지가 실제로 불러온 같은-출처 파일을 전부 캐시 무시하고 다시 받아온다.
    // localStorage 는 건드리지 않으므로 로그인 자리를 잃지 않는다
    // (iOS 에서 '방문 기록 및 웹사이트 데이터 지우기' 를 하면 그게 같이 날아간다).
    root.querySelector('#refreshBtn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = '받는 중…';

      const urls = new Set([
        location.href.split('#')[0],
        new URL('manifest.webmanifest', location.href).href,
      ]);
      for (const entry of performance.getEntriesByType('resource')) {
        if (entry.name.startsWith(location.origin)) urls.add(entry.name);
      }

      await Promise.all([...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
      location.reload();
    });

    root.querySelector('#themeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-mode]');
      if (!btn) return;
      setMode(btn.dataset.themeMode);
      root.querySelectorAll('#themeSeg button').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.themeMode === btn.dataset.themeMode);
      });
    });

    root.querySelector('#hereBtn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = '위치 확인 중…';

      const pos = await currentPosition();

      e.target.disabled = false;
      e.target.textContent = '📍 현재 위치 넣기';

      if (!pos) return toast('위치를 못 가져왔어요. 위치 권한을 확인해주세요', { error: true });

      root.querySelector('#lat').value = pos.lat.toFixed(6);
      root.querySelector('#lng').value = pos.lng.toFixed(6);
      toast('현재 좌표를 넣었어요');
    });

    root.querySelector('#cancelBtn')?.addEventListener('click', () => {
      editing = null;
      formOpen = false;
      render();
    });

    root.querySelector('#releaseBtn').addEventListener('click', async (e) => {
      if (!confirm('이 역할을 놓아줄까요? 같은 PIN으로 다른 기기가 들어올 수 있게 돼요.')) return;

      e.target.disabled = true;
      try {
        await releaseDevice();
        go('#/login');
      } catch (err) {
        toast(err.message, { error: true });
        e.target.disabled = false;
      }
    });

    root.querySelector('#cafeForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        id: editing?.id,
        name: root.querySelector('#name').value.trim(),
        building: root.querySelector('#building').value.trim(),
        lat: Number(root.querySelector('#lat').value),
        lng: Number(root.querySelector('#lng').value),
        radius_m: Number(root.querySelector('#radius').value),
      };

      if (!payload.name) return toast('이름을 넣어주세요', { error: true });
      if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
        return toast('좌표를 확인해주세요', { error: true });
      }

      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        const saved = await saveCafeteria(payload);
        cafeterias = editing
          ? cafeterias.map((c) => (c.id === saved.id ? saved : c))
          : [...cafeterias, saved];
        cafeterias.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        editing = null;
        formOpen = false; // 저장했으면 다시 접는다
        toast('저장했어요');
        render();
      } catch (err) {
        toast(err.message, { error: true });
        btn.disabled = false;
      }
    });
  }
}
