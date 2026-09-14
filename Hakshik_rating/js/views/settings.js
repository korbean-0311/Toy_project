import { listCafeterias, saveCafeteria, deleteCafeteria } from '../lib/store.js';
import { currentPosition } from '../lib/geo.js';
import { getRole, signOut, ROLES } from '../lib/auth.js';
import { esc } from '../lib/format.js';
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
          <h2 class="card-title">${editing ? '식당 수정' : '식당 추가'}</h2>
          <form class="form" id="cafeForm">
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
          <h2 class="card-title">역할</h2>
          <p class="card-desc">
            지금 이 기기는 <b>${role.emoji} ${role.label}</b> 으로 저장돼 있어요.
          </p>
          <button class="btn btn-ghost btn-block danger" id="signOutBtn">역할 바꾸기 (로그아웃)</button>
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
        render();
        return;
      }

      const delId = e.target.closest('[data-del]')?.dataset.del;
      if (!delId) return;
      if (!confirm('이 식당을 지울까요? 이미 올린 기록의 식당 표시가 사라져요.')) return;

      try {
        await deleteCafeteria(delId);
        cafeterias = cafeterias.filter((c) => c.id !== delId);
        if (editing?.id === delId) editing = null;
        toast('지웠어요');
        render();
      } catch (err) {
        toast(err.message, { error: true });
      }
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
      render();
    });

    root.querySelector('#signOutBtn').addEventListener('click', () => {
      if (!confirm('역할을 지우고 PIN 화면으로 돌아갈까요?')) return;
      signOut();
      go('#/login');
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
        toast('저장했어요');
        render();
      } catch (err) {
        toast(err.message, { error: true });
        btn.disabled = false;
      }
    });
  }
}
