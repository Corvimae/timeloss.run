import React from 'react';
import styled from 'styled-components';
import Head from 'next/head';
import Link from 'next/link';
import { AppProps } from 'next/dist/next-server/lib/router/router';

import '../styles/globals.css';

function Ranger({ Component, pageProps }: AppProps): React.ReactElement {
  return (
    <Layout>
      <Head>
        <title>timeloss.run</title>
        <link rel="shortcut icon" href="/favicon.png" />
        <meta charSet="UTF-8" />
      </Head>
      <Content>
        <Component {...pageProps} />
      </Content>
      <Footer>
        created by <a href="https://twitter.com/Corvimae" target="_blank" rel="noreferrer">@corvimae</a>&nbsp;
        <a href="https://github.com/corvimae/timeloss.run" target="_blank" rel="noreferrer">source</a>
      </Footer>
    </Layout>
  );
}

export default Ranger;

const Layout = styled.div`
  display: grid;
  width: 100vw;
  height: 100vh;
  background: #FFA17F;  /* fallback for old browsers */
  background: -webkit-linear-gradient(to top, #00223E, #FFA17F);  /* Chrome 10-25, Safari 5.1-6 */
  background: linear-gradient(to top, #00223E, #FFA17F); /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */
  grid-template-rows: 1fr max-content;
`;

const Content = styled.div`
  position: relative;
  overflow-y: auto;
`;

const Footer = styled.div`
  padding: 0.5rem 0.75rem;
  color: #fff;

  & > a {
    color: #9ac3ce;
  }

  & > a + a {
    margin-left: 2rem;
  }
`;
