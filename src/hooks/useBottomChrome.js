import { useEffect } from 'react';

// Publish a piece of fixed bottom chrome's height to the document root,
// so things OUTSIDE this component's subtree can stack above it.
//
// Why this exists. The app's layout contracts are CSS custom properties
// (--nav-h, --nav-total, --float-bar-h; see index.css), and a variable set
// with an inline style is only visible to that element's DESCENDANTS.
// That works fine while every consumer sits inside the page column — a
// .pb-nav page reading --float-bar-h off the Layout container it lives in,
// for instance. It stops working the moment a consumer is a SIBLING of the
// element that declares the value.
//
// The toast (components/shared/Toast.jsx) is exactly that: it is mounted at
// the page root, next to the whole routed tree, because a transient message
// has to be able to appear on any screen including the ones that are not
// inside Layout. Reading --float-bar-h from there got the :root default of
// 0px, never Layout's live value, so a toast raised while a workout was
// parked would have been drawn straight over the minimised workout bar and
// its running rest timer.
//
// Setting the property on document.documentElement instead makes it a real
// global: every consumer sees the same number wherever it sits in the tree.
// The owner of the chrome is still the only writer — the component that
// actually renders the bar is the one that declares how tall it is — and
// the value is removed on unmount, so the variable is only non-zero while
// the thing it describes is genuinely on screen.
export function useBottomChrome(name, height) {
  useEffect(() => {
    const root = document.documentElement;
    if (!height) {
      root.style.removeProperty(name);
      return undefined;
    }
    root.style.setProperty(name, height);
    return () => root.style.removeProperty(name);
  }, [name, height]);
}
