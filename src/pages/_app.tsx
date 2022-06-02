import "../styles/globals.css";
import styles from "../styles/Home.module.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import ConnectWalletButton from "../components/ConnectWalletButton";

import useWallet from "../hooks/useWallet";
import { ThemeProvider } from "next-themes";

function MyApp({ Component, pageProps }: AppProps) {
  useWallet();
  return (
    <div className={styles.container + " bg-th-bkg-1"}>
      <Head>
        <title>Mango Markets</title>
        <meta name="description" content="Mango Markets" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <ThemeProvider defaultTheme="Mango">
        <header className="flex justify-end">
          <ConnectWalletButton />
        </header>
        <main className={styles.main + " bg-th-bkg-2"}>
          <Component {...pageProps} />
        </main>
      </ThemeProvider>
    </div>
  );
}

export default MyApp;
