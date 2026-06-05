import './styles/main.css';
import { startApp } from './controllers/appController.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
