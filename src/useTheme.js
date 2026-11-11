import {useState,useEffect} from 'react';
export default function useTheme(){
  const [theme,setTheme]=useState(()=>{try{return localStorage.getItem('boredone.theme')==='light'?'light':'dark';}catch{return 'dark';}});
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#172922':'#fffcf1');
    try{localStorage.setItem('boredone.theme',theme);}catch{}
  },[theme]);
  return [theme,()=>setTheme(value=>value==='dark'?'light':'dark')];
}
