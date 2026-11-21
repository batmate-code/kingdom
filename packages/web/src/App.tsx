import { appVersionLine } from './version';
import styles from './App.module.css';

/** Заглушка интерфейса. Игровой экран появится на этапе 7. */
export function App() {
  return (
    <main className={styles.app}>
      <h1>Вампирская игра</h1>
      <p>{appVersionLine()}</p>
    </main>
  );
}
