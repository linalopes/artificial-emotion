import '@fontsource/space-grotesk/300.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/inter/300.css';
import '@fontsource/inter/600.css';
import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
