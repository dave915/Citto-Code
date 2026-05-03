import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { SecretaryFloating } from './SecretaryFloating'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SecretaryFloating />
  </React.StrictMode>,
)
