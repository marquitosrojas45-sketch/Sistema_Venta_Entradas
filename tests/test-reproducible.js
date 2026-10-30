/**
 * ==============================================================================
 * SUITE DE PRUEBAS REPRODUCIBLES AUTOMATIZADAS - SISTEMA DISTRIBUIDO
 * ==============================================================================
 * Valida:
 *  1. Salud de los microservicios (User, Inventory, Checkout).
 *  2. Autenticacion y emision de JWT (User Service).
 *  3. Propiedad de recursos y RBAC (USER vs ADMIN).
 *  4. Preparacion de inventario inicial (Inventory Service).
 *  5. PRUEBA DE CONCURRENCIA REAL: 2 compras simultaneas con stock = 1
 *     Demuestra la exclusion mutua administrada por el Lock de Redis en Inventory Service.
 *  6. Validacion de stock agotado (sin sobreventas ni numeros negativos).
 *  7. Seguridad de endpoints (rechazo de peticiones no autorizadas o sin token).
 *
 * Requiere:
 *  Entorno Docker Compose levantado (`docker compose up -d`).
 *  Ejecutar: node tests/test-reproducible.js
 * ==============================================================================
 */

const USER_URL = process.env.USER_SERVICE_URL || 'http://localhost:3000';
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001';
const CHECKOUT_URL = process.env.CHECKOUT_SERVICE_URL || 'http://localhost:3002';

const timestamp = Date.now().toString().slice(-6);

const adminCredentials = {
    nombre: 'Admin',
    apellido: 'Distribuida',
    dni: `99${timestamp}`,
    telefono: '2615550000',
    mail: `admin_${timestamp}@test.com`,
    password: 'AdminPassword123',
    role: 'ADMIN'
};

const userCredentials = {
    nombre: 'Cliente',
    apellido: 'Test',
    dni: `88${timestamp}`,
    telefono: '2615551111',
    mail: `cliente_${timestamp}@test.com`,
    password: 'UserPassword123',
    role: 'USER'
};

let adminToken = '';
let userToken = '';
let userId = '';

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, extraInfo = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  [OK] ${testName}`);
    } else {
        console.error(`  [FAIL] ${testName} - ${extraInfo}`);
    }
}

async function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ejecutarSuite() {
    console.log('\n================================================================');
    console.log(' INICIANDO SUITE DE PRUEBAS REPRODUCIBLES DEL SISTEMA DISTRIBUIDO');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // FASE 1: HEALTHCHECKS
    // -------------------------------------------------------------
    console.log('--- FASE 1: Verificacion de Estado de Salud (Healthchecks) ---');
    try {
        const resUser = await fetch(`${USER_URL}/health`);
        const dataUser = await resUser.json();
        assert(resUser.status === 200 && dataUser.status === 'ok', 'User Service esta saludable (3000)');

        const resInv = await fetch(`${INVENTORY_URL}/health`);
        const dataInv = await resInv.json();
        assert(resInv.status === 200 && dataInv.status === 'ok', 'Inventory Service esta saludable (3001)');
        assert(dataInv.redis === 'connected', 'Inventory Service conectado a Redis (Locks de Stock)');
        assert(dataInv.mongo === 'connected', 'Inventory Service conectado a MongoDB');

        const resCheck = await fetch(`${CHECKOUT_URL}/health`);
        const dataCheck = await resCheck.json();
        assert(resCheck.status === 200 && dataCheck.status === 'ok', 'Checkout Service esta saludable (3002)');
    } catch (err) {
        console.error('Error conectando a los servicios. Verifique que docker compose este corriendo:', err.message);
        process.exit(1);
    }

    // -------------------------------------------------------------
    // FASE 2: REGISTRO Y LOGIN (USER SERVICE)
    // -------------------------------------------------------------
    console.log('\n--- FASE 2: Autenticacion y Emision de JWT (User Service) ---');
    // 2.1 Registro Admin
    const regAdminRes = await fetch(`${USER_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminCredentials)
    });
    assert(regAdminRes.status === 201, 'Registro de usuario ADMIN exitoso');

    // 2.2 Login Admin
    const loginAdminRes = await fetch(`${USER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mail: adminCredentials.mail, password: adminCredentials.password })
    });
    const loginAdminData = await loginAdminRes.json();
    assert(loginAdminRes.status === 200 && !!loginAdminData.accessToken, 'Login ADMIN devuelve JWT valido');
    adminToken = loginAdminData.accessToken;

    // 2.3 Registro User
    const regUserRes = await fetch(`${USER_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userCredentials)
    });
    const regUserData = await regUserRes.json();
    userId = regUserData._id;
    assert(regUserRes.status === 201, 'Registro de usuario USER exitoso');

    // 2.4 Login User
    const loginUserRes = await fetch(`${USER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mail: userCredentials.mail, password: userCredentials.password })
    });
    const loginUserData = await loginUserRes.json();
    assert(loginUserRes.status === 200 && !!loginUserData.accessToken, 'Login USER devuelve JWT valido');
    userToken = loginUserData.accessToken;

    // -------------------------------------------------------------
    // FASE 3: PREPARACION DE INVENTARIO (INVENTORY SERVICE)
    // -------------------------------------------------------------
    console.log('\n--- FASE 3: Preparacion de Stock para la Prueba Concurrente ---');
    // Ajustar stock a exactamente 1 entrada usando credenciales ADMIN
    const stockInitRes = await fetch(`${INVENTORY_URL}/api/inventario/stock`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ producto: 'Entrada Conferencia', stock: 1 })
    });
    const stockInitData = await stockInitRes.json();
    assert(stockInitRes.status === 200 && stockInitData.inventario.stock === 1, 'Stock fijado en 1 por ADMIN para la prueba');

    // Consulta publica de inventario
    const catRes = await fetch(`${INVENTORY_URL}/api/inventario`);
    const catalogo = await catRes.json();
    const item = catalogo.find(i => i.producto === 'Entrada Conferencia');
    assert(item && item.stock === 1, 'Catalogo publico refleja 1 unidad disponible');

    // -------------------------------------------------------------
    // FASE 4: PRUEBA DE CONCURRENCIA REAL Y EXCLUSION MUTUA
    // -------------------------------------------------------------
    console.log('\n--- FASE 4: Ejecucion Concurrente Simultanea (Exclusion Mutua con Lock) ---');
    console.log('  Disparando 2 peticiones POST /api/comprar simultaneas (Promise.all) compitiendo por 1 unidad...');

    const [compra1, compra2] = await Promise.all([
        fetch(`${CHECKOUT_URL}/api/comprar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ producto: 'Entrada Conferencia' })
        }),
        fetch(`${CHECKOUT_URL}/api/comprar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ producto: 'Entrada Conferencia' })
        })
    ]);

    const res1 = { status: compra1.status, data: await compra1.json() };
    const res2 = { status: compra2.status, data: await compra2.json() };

    console.log(`  Respuesta Peticion A -> Status: ${res1.status}, Cuerpo:`, res1.data);
    console.log(`  Respuesta Peticion B -> Status: ${res2.status}, Cuerpo:`, res2.data);

    const statuses = [res1.status, res2.status];
    const unaExitosa = statuses.includes(200);
    const unaRechazada = statuses.includes(409) || statuses.includes(400);
    const noAmbasExitosas = !(res1.status === 200 && res2.status === 200);

    assert(unaExitosa, 'Exactamente una transaccion consiguio comprar (Status 200 OK)');
    assert(unaRechazada, 'La otra transaccion fue rechazada (Status 409 Conflict por lock o 400 por stock)');
    assert(noAmbasExitosas, 'Se evito la sobreventa concurrente (NO hubo 2 compras exitosas)');

    // Verificar stock final en base de datos
    const catPostRes = await fetch(`${INVENTORY_URL}/api/inventario`);
    const catPost = await catPostRes.json();
    const itemPost = catPost.find(i => i.producto === 'Entrada Conferencia');
    assert(itemPost && itemPost.stock === 0, 'El stock final en MongoDB es exactamente 0 (sin negativos)');

    // -------------------------------------------------------------
    // FASE 5: PRUEBA CON STOCK AGOTADO
    // -------------------------------------------------------------
    console.log('\n--- FASE 5: Intento de Compra con Stock Agotado ---');
    const compraAgotadaRes = await fetch(`${CHECKOUT_URL}/api/comprar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ producto: 'Entrada Conferencia' })
    });
    const compraAgotadaData = await compraAgotadaRes.json();
    assert(compraAgotadaRes.status === 400, 'Compra con stock agotado devuelve HTTP 400 Bad Request');
    assert(compraAgotadaData.error === 'Stock insuficiente', 'Mensaje de error especifica "Stock insuficiente"');

    // -------------------------------------------------------------
    // FASE 6: VALIDACION DE ROLES Y SEGURIDAD (RBAC Y PROPIEDAD)
    // -------------------------------------------------------------
    console.log('\n--- FASE 6: Validacion de Seguridad y RBAC ---');
    // 6.1 Usuario normal intenta alterar stock -> 403 Forbidden
    const intentoHackStock = await fetch(`${INVENTORY_URL}/api/inventario/stock`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ producto: 'Entrada Conferencia', stock: 100 })
    });
    assert(intentoHackStock.status === 403, 'Usuario normal bloqueado al intentar modificar stock (403 Forbidden)');

    // 6.2 Intento de compra sin token -> 401 Unauthorized
    const compraSinToken = await fetch(`${CHECKOUT_URL}/api/comprar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ producto: 'Entrada Conferencia' })
    });
    assert(compraSinToken.status === 401, 'Compra sin token rechazada con 401 Unauthorized');

    // 6.3 Intento de compra con token invalido -> 401 Unauthorized
    const compraTokenFalso = await fetch(`${CHECKOUT_URL}/api/comprar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token_invalido_criptograficamente'
        },
        body: JSON.stringify({ producto: 'Entrada Conferencia' })
    });
    assert(compraTokenFalso.status === 401, 'Compra con token manipulado rechazada con 401 Unauthorized');

    // 6.4 Propiedad de recurso: Usuario consulta su propio perfil -> 200 OK
    const propioPerfil = await fetch(`${USER_URL}/api/usuarios/${userId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(propioPerfil.status === 200, 'Usuario consulta su propio perfil exitosamente (200 OK)');

    // 6.5 Propiedad de recurso: Usuario consulta perfil ajeno -> 403 Forbidden
    const idAjeno = '660000000000000000000001';
    const perfilAjeno = await fetch(`${USER_URL}/api/usuarios/${idAjeno}`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(perfilAjeno.status === 403, 'Usuario bloqueado al consultar perfil de otro usuario (403 Forbidden)');

    // -------------------------------------------------------------
    // RESUMEN FINAL
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(` RESULTADO FINAL DE LA SUITE: ${passedTests} / ${totalTests} PRUEBAS SUPERADAS`);
    if (passedTests === totalTests) {
        console.log(' ESTADO: TODAS LAS PRUEBAS PASARON EXITOSAMENTE [OK]');
    } else {
        console.log(` ESTADO: HUBO ${totalTests - passedTests} FALLOS EN LA SUITE`);
    }
    console.log('================================================================\n');

    process.exit(passedTests === totalTests ? 0 : 1);
}

ejecutarSuite().catch(err => {
    console.error('Error fatal durante la ejecucion de la suite:', err);
    process.exit(1);
});
