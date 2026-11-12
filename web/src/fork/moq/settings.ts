import '@moq/watch/ui';
import type MoqWatch from '@moq/watch/element';

export type NativeSettings = ReturnType<typeof NativeSettings.mount>;

export const NativeSettings = {
  mount(host: HTMLElement, watch: MoqWatch, onDelaySelection: (value: MoqWatch['delay']) => void) {
    const ui = document.createElement('moq-watch-ui');
    ui.className = 'block w-full h-full';
    const root = ui.shadowRoot!;
    const style = document.createElement('style');
    style.textContent = `
      .player { height: 100%; border-radius: 0; background: transparent; }
      .chrome, .center, .scrim { display: none; }
      .player:not(.player--chrome) { cursor: default; }
      .panel { z-index: 80; }
      .panel:not(.panel--open) { visibility: hidden; }
    `;
    root.appendChild(style);
    ui.appendChild(watch);
    host.appendChild(ui);

    let trigger: HTMLButtonElement | undefined;
    function nativeToggle() {
      root.querySelector<HTMLButtonElement>('.chrome button[aria-expanded]')!.click();
    }
    root.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.panel-head button')) trigger?.focus();
      const preset = event.target.closest('.latency-presets .chip');
      if (preset) onDelaySelection(preset.textContent === 'Auto' ? 'auto' : watch.controls.delay.peek());
    });
    root.addEventListener('mousedown', event => {
      if (event.target instanceof Element && event.target.closest('.buffer-visualization')) onDelaySelection(watch.controls.delay.peek());
    });
    root.addEventListener('keydown', event => {
      if (event instanceof KeyboardEvent && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
        && event.target instanceof Element && event.target.closest('.buffer-visualization')) onDelaySelection(watch.controls.delay.peek());
    });
    ui.addEventListener('keydown', event => {
      if (event.key === 'Escape' && root.querySelector('.panel--open')) {
        event.preventDefault();
        nativeToggle();
        trigger?.focus();
      }
    });

    return {
      toggle(button: HTMLButtonElement) {
        trigger = button;
        const opening = !root.querySelector('.panel--open');
        nativeToggle();
        queueMicrotask(() => {
          if (opening) root.querySelector<HTMLButtonElement>('.panel-tab[aria-selected="true"]')!.focus();
          else trigger?.focus();
        });
      },
      close() {
        ui.remove();
      },
    };
  },
};
