import '../ui/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Zhiyuan admin console root is missing.');
ReactDOM.createRoot(root).render(<React.StrictMode><AdminApp /></React.StrictMode>);
