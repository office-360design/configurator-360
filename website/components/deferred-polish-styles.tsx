import { polishStylesBootstrap } from '../lib/website-bootstrap.js';

const POLISH_STYLESHEET = "/styles/homepage-polish.css";

export function DeferredPolishStyles() {
  return <>
    <link id="website-polish-styles" rel="stylesheet" href={POLISH_STYLESHEET} media="print" />
    <script dangerouslySetInnerHTML={{__html: polishStylesBootstrap}} />
    <noscript><link rel="stylesheet" href={POLISH_STYLESHEET} /></noscript>
  </>;
}
