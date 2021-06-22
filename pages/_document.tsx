import React from 'react';
import { ServerStyleSheet } from 'styled-components';
import Document from 'next/document';
import { DocumentContext, DocumentInitialProps, RenderPageResult } from 'next/dist/next-server/lib/utils';

export default class RangerDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<DocumentInitialProps> {
    const sheet = new ServerStyleSheet();
    const originalRenderPage = ctx.renderPage;

    try {
      ctx.renderPage = (): RenderPageResult | Promise<RenderPageResult> => (
        originalRenderPage({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          enhanceApp: (App: any) => (props: any) => sheet.collectStyles(<App {...props} />),
        })
      );

      const initialProps = await Document.getInitialProps(ctx);

      return {
        ...initialProps,
        styles: (
          <>
            {initialProps.styles}
            {sheet.getStyleElement()}
          </>
        ),
      };
    } finally {
      sheet.seal();
    }
  }
}
