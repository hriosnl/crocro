console.log('Crocro popup main.tsx loading')
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

console.log('Crocro popup main.tsx about to render')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
console.log('Crocro popup rendered')