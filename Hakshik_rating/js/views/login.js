import { signInWithPin } from '../lib/auth.js';
import { setAppbar, toast } from '../ui.js';

export default function login(root) {
  setAppbar(null);

  root.innerHTML = `
    <div class="gate">
      <img class="gate-mark" src="icon-192.png" alt="" width="96" height="96" />
      <h1 class="gate-title">자기는 뭘 먹을까?</h1>
      <p class="gate-sub">PIN을 넣으면 이 기기가 그 역할을 가져가요.<br />역할당 한 기기만 쓸 수 있어요.</p>

      <form class="gate-form" id="pinForm">
        <!-- 긴 코드라서 가리지 않는다. 한 번만 넣는 값이고, 가려두면
             오타가 안 보여서 "PIN이 맞지 않습니다" 만 반복하게 된다. -->
        <input class="pin-input" id="pin" type="text"
               autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
               maxlength="64" placeholder="hakshik-0000-0000-0000-0000" aria-label="PIN" />
        <button class="btn btn-primary" type="submit" id="goBtn">들어가기</button>
        <p class="gate-error" id="pinError" role="alert" hidden></p>
      </form>

      <div class="gate-takeover" id="takeover" hidden>
        <p id="takeoverText"></p>
        <button class="btn btn-primary btn-block" type="button" id="takeoverBtn">
          이 기기로 옮기기
        </button>
        <button class="btn btn-ghost btn-block" type="button" id="takeoverCancel">그만두기</button>
      </div>
    </div>`;

  const form = root.querySelector('#pinForm');
  const input = root.querySelector('#pin');
  const btn = root.querySelector('#goBtn');
  const error = root.querySelector('#pinError');
  const takeover = root.querySelector('#takeover');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    attempt(input.value, false);
  });

  root.querySelector('#takeoverBtn').addEventListener('click', () => {
    attempt(input.value, true);
  });

  root.querySelector('#takeoverCancel').addEventListener('click', () => {
    takeover.hidden = true;
    form.hidden = false;
    input.value = '';
    input.focus();
  });

  async function attempt(pin, force) {
    error.hidden = true;
    btn.disabled = true;
    btn.textContent = '확인 중…';

    const result = await signInWithPin(pin, { takeover: force });

    btn.disabled = false;
    btn.textContent = '들어가기';

    if (result.ok) return enter(result.role);

    if (result.taken) {
      // 자리가 차 있다 — 뺏기 전에 확인을 받는다
      root.querySelector('#takeoverText').textContent =
        `${result.reason} 이 기기로 옮기면 그 기기는 로그아웃돼요.`;
      takeover.hidden = false;
      form.hidden = true;
      return;
    }

    error.textContent = result.reason;
    error.hidden = false;
    input.select();
  }

  function enter(role) {
    toast(role === 'uploader' ? '올리는 사람으로 들어왔어요' : '평가하는 사람으로 들어왔어요');

    // 공유 링크로 들어온 경우엔 원래 가려던 곳으로 되돌린다
    const next = sessionStorage.getItem('hakshik.next');
    sessionStorage.removeItem('hakshik.next');
    location.hash = next || '#/';
  }

  input.focus();
}
