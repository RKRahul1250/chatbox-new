import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Mobilemenu from './Mobilemenu'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Mobilemenu />
  </StrictMode>,
)