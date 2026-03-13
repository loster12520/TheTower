import { makeAutoObservable } from 'mobx';

export type ThemeMode = 'light' | 'dark';

class UiStore {
  theme: ThemeMode = 'light';

  constructor() {
    makeAutoObservable(this);
    this.initTheme();
  }

  private initTheme() {
    if (typeof window === 'undefined') {
      return;
    }
    const saved = window.localStorage.getItem('thetower_theme') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      this.theme = saved;
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.theme = prefersDark ? 'dark' : 'light';
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('thetower_theme', this.theme);
    }
  }
}

export const uiStore = new UiStore();
