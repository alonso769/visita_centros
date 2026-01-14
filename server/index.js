const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

// TUS CREDENCIALES
const CREDENCIALES = {
    user: 'lnateros',
    pass: '980196684'
};

const delay = (time) => new Promise(resolve => setTimeout(resolve, time));

app.post('/api/buscar-dni', async (req, res) => {
    // 3 minutos de tiempo máximo
    req.setTimeout(180000); 
    
    const { dni } = req.body;
    console.log(`🤖 ROBOT V21: Solicitud para DNI ${dni}...`);

    let browser = null;

    try {
        browser = await puppeteer.launch({ 
            // 'new' oculta la ventana.
            headless: 'new', 
            
            // IMPORTANTE: Ignorar errores de certificados (común en MINSA)
            ignoreHTTPSErrors: true,
            
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--start-maximized',
                // Estos flags ayudan a que no detecten que es un robot
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        const pages = await browser.pages();
        const page = pages[0];

        // --- DISFRAZ DE HUMANO (CLAVE PARA QUE NO TE BLOQUEEN) ---
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        // 1. LOGIN
        console.log(`[${dni}] Paso 1: Navegando al Login...`);
        
        // Usamos waitUntil: 'networkidle2' para esperar a que cargue todo bien
        await page.goto('https://internoscs.minsa.gob.pe/Seguridad/Login', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Popup Fechas (Intento rápido)
        try {
            await page.waitForSelector('button', { timeout: 2000 }); // Esperar un poco a que aparezca algo
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('CERRAR'));
                if (btn) btn.click();
            });
        } catch (e) { /* Si no hay popup, seguimos */ }
        
        await page.keyboard.press('Escape'); 

        // Credenciales (Aumentamos el timeout por si el internet está lento)
        console.log(`[${dni}] Escribiendo credenciales...`);
        await page.waitForSelector('input[placeholder="Usuario"]', { timeout: 30000 });
        
        await page.type('input[placeholder="Usuario"]', CREDENCIALES.user, { delay: 50 }); 
        await page.type('input[type="password"]', CREDENCIALES.pass, { delay: 50 });
        await delay(500); 

        // Click Login
        await page.evaluate(() => {
            const btn = document.getElementById('btnVerificarAcceso');
            if (btn) { btn.removeAttribute('disabled'); btn.click(); }
        });
        
        console.log(`[${dni}] Entrando al sistema...`);
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });

        // Limpiar Bienvenida
        await delay(1000);
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button.btn-danger')).find(b => b.innerText.includes('CERRAR'));
            if (btn) btn.click();
        });

        // 2. NAVEGAR MENU
        console.log(`[${dni}] Paso 2: Buscando opción de menú...`);
        
        // Estrategia robusta para encontrar el menú
        const menuClick = await page.evaluate(() => {
            // Buscar texto "PROCESO"
            const links = Array.from(document.querySelectorAll('a'));
            const proceso = links.find(x => x.innerText.toUpperCase().includes('PROCESO'));
            if (proceso) { proceso.click(); return true; }
            return false;
        });

        if(menuClick) await delay(800);

        try {
            // Intentar clic directo al submenú
            await page.waitForSelector('#lnkAsociarInternoAmbito', { timeout: 5000 });
            await page.click('#lnkAsociarInternoAmbito');
        } catch (e) {
            // Fallback: Forzar clic por JS
            await page.evaluate(() => {
                const link = document.getElementById('lnkAsociarInternoAmbito');
                if(link) link.click();
            });
        }
        
        // 3. ESPERAR TABLA (Punto crítico)
        console.log(`[${dni}] ⏳ Esperando carga de datos...`);
        await page.waitForSelector('#divGrillaListadoProcesosInternados', { visible: true, timeout: 60000 });

        // Seleccionar primera convocatoria si no hay lupa
        await delay(1000); 
        const hayLupa = await page.evaluate(() => {
            const img = document.querySelector('#divGrillaListadoProcesosInternados img[title*="Visualizar"]');
            if (img) { img.click(); return true; }
            return false;
        });
        
        if (!hayLupa) {
            await page.click('#divGrillaListadoProcesosInternados table tbody tr:first-child a').catch(() => {});
        }

        // 4. BÚSQUEDA DEL DNI
        console.log(`[${dni}] 🔍 Buscando postulante...`);
        const idDni = '#txtNumeroDocumentoPostulanteRegistrado';
        await page.waitForSelector(idDni, { visible: true, timeout: 30000 });

        // Limpiar y escribir
        await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, idDni);
        await page.type(idDni, dni, { delay: 50 });
        await page.keyboard.press('Tab');
        await delay(500);

        // Click Botón Buscar
        await page.evaluate(() => {
            const btn = document.getElementById('btnBuscarInformacionPostulantesInscritos');
            if(btn) btn.click();
        });

        // 5. SELECCIONAR RESULTADO
        await delay(2000); // Esperar refresco de tabla

        const resultadoClick = await page.evaluate((dniBuscado) => {
            const filas = Array.from(document.querySelectorAll('#divGrillaListadoProcesosInternados table tbody tr'));
            const fila = filas.find(tr => tr.innerText.includes(dniBuscado));
            
            if (fila) {
                const lupa = fila.querySelector('img[src*="visualizar.png"]');
                if (lupa) {
                    lupa.click();
                    // Refuerzo clic al padre
                    if(lupa.parentElement && lupa.parentElement.tagName === 'A') lupa.parentElement.click();
                    return "OK";
                }
            }
            // Intento desesperado: si solo hay 1 fila en la tabla (la del resultado)
            const todasLupas = document.querySelectorAll('img[src*="visualizar.png"]');
            if(todasLupas.length === 1) {
                todasLupas[0].click();
                return "OK_GENERICO";
            }
            return "NO";
        }, dni);

        if (resultadoClick === "NO") {
            console.log(`[${dni}] ❌ DNI no encontrado.`);
            return res.json({ success: true, found: false });
        }

        // 6. EXTRACCIÓN
        console.log(`[${dni}] 📥 Extrayendo datos...`);
        await page.waitForSelector('#txtNombre', { visible: true, timeout: 20000 });
        await delay(500); 

        const datos = await page.evaluate(() => {
            const val = (id) => {
                const e = document.getElementById(id);
                return e ? (e.value || e.innerText || "").trim() : "";
            };
            return {
                nombres: val('txtNombre'),
                apePat: val('txtApellidoPaternoMantenimiento'), 
                apeMat: val('txtApellidoMaternoMantenimiento'),
                fullText: document.body.innerText 
            };
        });

        const extract = (regex, text) => {
            const m = text.match(regex);
            return m ? m[1].trim() : "-";
        };

        const resultadoFinal = {
            nombres: datos.nombres,
            apePat: datos.apePat,
            apeMat: datos.apeMat,
            universidad: extract(/Universidad de procedencia\s*\n?(.+)/i, datos.fullText),
            carrera: extract(/Escuela Profesional\s*\n?(.+)/i, datos.fullText)
        };

        console.log(`[${dni}] ✅ ÉXITO: ${resultadoFinal.nombres}`);
        res.json({ success: true, found: true, data: resultadoFinal });

    } catch (error) {
        console.error(`[${dni}] ❌ ERROR:`, error.message);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) {
            console.log(`[${dni}] 🧹 Limpiando...`);
            await browser.close().catch(()=>console.log("Browser ya cerrado"));
        }
    }
});

app.listen(3001, () => {
    console.log('🤖 ROBOT V21 (ANTI-BLOQUEO) listo en puerto 3001');
});