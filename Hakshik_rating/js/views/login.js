import { signInWithPin } from '../lib/auth.js';
import { setAppbar, toast } from '../ui.js';

export default function login(root) {
  setAppbar(null);

  root.innerHTML = `
    <div class="gate">
      <div class="gate-mark">🍚</div>
      <h1 class="gate-title">학식 평점</h1>
      <p class="gate-sub">PIN을 넣으면 이 기기가 그 역할을 가져가요.<br />역할당 한 기기만 들어올 수 있어요.</p>

      <form class="gate-form" id="pinForm">
        <input class="pin-input" id="pin" type="password" inputmode="numeric"
               autocomplete="off" maxlength="8" placeholder="• • • •" aria-label="PIN" />
        <button class="btn btn-primary" type="submit" id="goBtn">들어가기</button>
        <p class="gate-error" id="pinError" role="alert" hidden></p>
      </form>
    </div>`;

  const form = root.querySelector('#pinForm');
  const input = root.querySelector('#pin');
  const btn = root.querySelector('#goBtn');
  const error = root.querySelector('#pinError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    error.hidden = true;
    btn.disabled = true;
    btn.textContent = '확인 중…';

    const result = await signInWithPin(input.value);

    btn.disabled = false;
    btn.textContent = '들어가기';

    if (!result.ok) {
      error.textContent = result.reason;
      error.hidden = false;
      input.value = '';
      input.focus();
      return;
    }

    toast(result.role === 'uploader' ? '올리는 사람으로 들어왔어요' : '평가하는 사람으로 들어왔어요');

    // 공유 링크로 들어온 경우엔 원래 가려던 곳으로 되돌린다
    const next = sessionStorage.getItem('hakshik.next');
    sessionStorage.removeItem('hakshik.next');
    location.hash = next || '#/';
  });

  input.focus();
}
