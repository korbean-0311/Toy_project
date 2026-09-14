import { signInWithPin } from '../lib/auth.js';
import { setAppbar, toast } from '../ui.js';

export default function login(root) {
  setAppbar(null);

  root.innerHTML = `
    <div class="gate">
      <div class="gate-mark">🍚</div>
      <h1 class="gate-title">학식 평점</h1>
      <p class="gate-sub">PIN을 넣으면 역할이 이 기기에 저장돼요.</p>

      <form class="gate-form" id="pinForm">
        <input class="pin-input" id="pin" type="password" inputmode="numeric"
               autocomplete="off" maxlength="8" placeholder="• • • •" aria-label="PIN" />
        <button class="btn btn-primary" type="submit">들어가기</button>
        <p class="gate-error" id="pinError" role="alert" hidden></p>
      </form>
    </div>`;

  const form = root.querySelector('#pinForm');
  const input = root.querySelector('#pin');
  const error = root.querySelector('#pinError');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const role = signInWithPin(input.value);

    if (!role) {
      error.textContent = 'PIN이 맞지 않아요.';
      error.hidden = false;
      input.value = '';
      input.focus();
      return;
    }

    toast(role === 'uploader' ? '올리는 사람으로 들어왔어요' : '평가하는 사람으로 들어왔어요');
    // 공유 링크로 들어온 경우엔 원래 가려던 곳으로 되돌린다
    const next = sessionStorage.getItem('hakshik.next');
    sessionStorage.removeItem('hakshik.next');
    location.hash = next || '#/';
  });

  input.focus();
}
