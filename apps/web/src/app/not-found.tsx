import styles from "./not-found.module.css";

// Next's built-in fallback emits unnonced CSS and style attributes. Keep the
// same 404 content in an ordinary stylesheet, including for soft navigation.
export default function NotFound() {
  return (
    <main className={styles.page}>
      <div>
        <h1 className={styles.code}>404</h1>
        <div className={styles.message}>
          <h2>This page could not be found.</h2>
        </div>
      </div>
    </main>
  );
}
