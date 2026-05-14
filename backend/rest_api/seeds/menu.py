"""
Seed module: Menu (Categories, Subcategories, Products).
Creates the full menu hierarchy with branch pricing and allergen associations.
"""

from sqlalchemy.orm import Session

from rest_api.models import (
    Category,
    Subcategory,
    Product,
    BranchProduct,
    ProductAllergen,
    CookingMethod,
    FlavorProfile,
    TextureProfile,
    CuisineType,
    IngredientGroup,
    Ingredient,
)
from shared.config.logging import rest_api_logger as logger


CATEGORIES_DATA = [
    {"name": "Bebidas", "order": 1},
    {"name": "Entradas", "order": 2},
    {"name": "Principales", "order": 3},
    {"name": "Postres", "order": 4},
]

SUBCATEGORIES_DATA = [
    {"category": "Bebidas", "name": "Gaseosas", "order": 1},
    {"category": "Bebidas", "name": "Jugos", "order": 2},
    {"category": "Bebidas", "name": "Cervezas", "order": 3},
    {"category": "Bebidas", "name": "Vinos", "order": 4},
    {"category": "Entradas", "name": "Empanadas", "order": 1},
    {"category": "Entradas", "name": "Picadas", "order": 2},
    {"category": "Principales", "name": "Carnes", "order": 1},
    {"category": "Principales", "name": "Pastas", "order": 2},
    {"category": "Principales", "name": "Ensaladas", "order": 3},
    {"category": "Postres", "name": "Helados", "order": 1},
    {"category": "Postres", "name": "Tortas", "order": 2},
]

PRODUCTS_DATA = [
    # Bebidas - Gaseosas
    {"name": "Coca-Cola 500ml", "category": "Bebidas", "subcategory": "Gaseosas", "price": 1500, "description": "Coca-Cola línea regular"},
    {"name": "Sprite 500ml", "category": "Bebidas", "subcategory": "Gaseosas", "price": 1500, "description": "Sprite lima-limón"},
    {"name": "Fanta 500ml", "category": "Bebidas", "subcategory": "Gaseosas", "price": 1500, "description": "Fanta naranja"},
    {"name": "Agua mineral 500ml", "category": "Bebidas", "subcategory": "Gaseosas", "price": 1000, "description": "Agua mineral sin gas"},
    # Bebidas - Jugos
    {"name": "Jugo de naranja", "category": "Bebidas", "subcategory": "Jugos", "price": 2000, "description": "Jugo de naranja exprimido"},
    {"name": "Limonada", "category": "Bebidas", "subcategory": "Jugos", "price": 1800, "description": "Limonada casera con menta"},
    # Bebidas - Cervezas
    {"name": "Quilmes 500ml", "category": "Bebidas", "subcategory": "Cervezas", "price": 2500, "description": "Cerveza rubia argentina"},
    {"name": "Patagonia Amber Lager", "category": "Bebidas", "subcategory": "Cervezas", "price": 3500, "description": "Cerveza artesanal"},
    # Bebidas - Vinos
    {"name": "Malbec Reserva", "category": "Bebidas", "subcategory": "Vinos", "price": 8500, "description": "Vino tinto Malbec de Mendoza", "allergens": ["Sulfitos"]},
    {"name": "Torrontés", "category": "Bebidas", "subcategory": "Vinos", "price": 7000, "description": "Vino blanco aromático", "allergens": ["Sulfitos"]},
    # Entradas - Empanadas
    {"name": "Empanada de carne", "category": "Entradas", "subcategory": "Empanadas", "price": 1200, "description": "Empanada de carne cortada a cuchillo", "featured": True, "allergens": ["Gluten"]},
    {"name": "Empanada de pollo", "category": "Entradas", "subcategory": "Empanadas", "price": 1200, "description": "Empanada de pollo con cebolla", "allergens": ["Gluten"]},
    {"name": "Empanada de jamón y queso", "category": "Entradas", "subcategory": "Empanadas", "price": 1200, "description": "Empanada de jamón y queso", "allergens": ["Gluten", "Lácteos"]},
    {"name": "Empanada de verdura", "category": "Entradas", "subcategory": "Empanadas", "price": 1100, "description": "Empanada de acelga con pasas", "allergens": ["Gluten", "Huevos"]},
    # Entradas - Picadas
    {"name": "Picada para 2", "category": "Entradas", "subcategory": "Picadas", "price": 9500, "description": "Fiambres, quesos, aceitunas y pan", "allergens": ["Gluten", "Lácteos"]},
    {"name": "Tabla de quesos", "category": "Entradas", "subcategory": "Picadas", "price": 7500, "description": "Selección de quesos argentinos", "allergens": ["Lácteos"]},
    {"name": "Provoleta", "category": "Entradas", "subcategory": "Picadas", "price": 4500, "description": "Provolone a la parrilla con orégano", "featured": True, "allergens": ["Lácteos"]},
    # Principales - Carnes
    {"name": "Bife de chorizo", "category": "Principales", "subcategory": "Carnes", "price": 15000, "description": "400g de bife de chorizo a la parrilla", "featured": True, "popular": True},
    {"name": "Asado de tira", "category": "Principales", "subcategory": "Carnes", "price": 13500, "description": "Costillas de res a la parrilla", "popular": True},
    {"name": "Entraña", "category": "Principales", "subcategory": "Carnes", "price": 14000, "description": "Entraña a la parrilla con chimichurri"},
    {"name": "Vacío", "category": "Principales", "subcategory": "Carnes", "price": 12500, "description": "Vacío a la parrilla"},
    {"name": "Pollo a la parrilla", "category": "Principales", "subcategory": "Carnes", "price": 9500, "description": "Medio pollo a la parrilla"},
    {"name": "Milanesa napolitana", "category": "Principales", "subcategory": "Carnes", "price": 11000, "description": "Milanesa con jamón, queso y salsa", "popular": True, "allergens": ["Gluten", "Huevos", "Lácteos"]},
    {"name": "Milanesa con papas fritas", "category": "Principales", "subcategory": "Carnes", "price": 10000, "description": "Milanesa de carne con papas fritas", "allergens": ["Gluten", "Huevos"]},
    # Principales - Pastas
    {"name": "Sorrentinos de jamón y queso", "category": "Principales", "subcategory": "Pastas", "price": 9500, "description": "Pasta rellena con salsa rosa", "allergens": ["Gluten", "Huevos", "Lácteos"]},
    {"name": "Ñoquis con bolognesa", "category": "Principales", "subcategory": "Pastas", "price": 8500, "description": "Ñoquis de papa con salsa de carne", "allergens": ["Gluten", "Huevos"]},
    {"name": "Ravioles de ricota", "category": "Principales", "subcategory": "Pastas", "price": 9000, "description": "Ravioles con salsa filetto", "allergens": ["Gluten", "Huevos", "Lácteos"]},
    {"name": "Tallarines con tuco", "category": "Principales", "subcategory": "Pastas", "price": 7500, "description": "Tallarines caseros con salsa de tomate", "allergens": ["Gluten", "Huevos"]},
    # Principales - Ensaladas
    {"name": "Ensalada César", "category": "Principales", "subcategory": "Ensaladas", "price": 6500, "description": "Lechuga, pollo, parmesano y crutones", "allergens": ["Gluten", "Huevos", "Lácteos"]},
    {"name": "Ensalada mixta", "category": "Principales", "subcategory": "Ensaladas", "price": 4500, "description": "Lechuga, tomate, cebolla y zanahoria"},
    {"name": "Ensalada caprese", "category": "Principales", "subcategory": "Ensaladas", "price": 5500, "description": "Tomate, mozzarella fresca y albahaca", "allergens": ["Lácteos"]},
    # Postres - Helados
    {"name": "Helado 2 bochas", "category": "Postres", "subcategory": "Helados", "price": 3500, "description": "Dos bochas del sabor que prefieras", "allergens": ["Lácteos"]},
    {"name": "Copa helada", "category": "Postres", "subcategory": "Helados", "price": 5000, "description": "Helado con crema, dulce de leche y nueces", "allergens": ["Lácteos", "Frutos secos"]},
    # Postres - Tortas
    {"name": "Flan casero", "category": "Postres", "subcategory": "Tortas", "price": 3800, "description": "Flan con dulce de leche y crema", "featured": True, "allergens": ["Huevos", "Lácteos"]},
    {"name": "Tiramisú", "category": "Postres", "subcategory": "Tortas", "price": 4500, "description": "Postre italiano con café y mascarpone", "allergens": ["Gluten", "Huevos", "Lácteos"]},
    {"name": "Brownie con helado", "category": "Postres", "subcategory": "Tortas", "price": 5000, "description": "Brownie tibio con helado de crema", "allergens": ["Gluten", "Huevos", "Lácteos", "Frutos secos"]},
    {"name": "Panqueques con dulce de leche", "category": "Postres", "subcategory": "Tortas", "price": 4000, "description": "Panqueques rellenos con dulce de leche", "allergens": ["Gluten", "Huevos", "Lácteos"]},
]

INGREDIENT_GROUPS_DATA = [
    {"name": "Carnes", "ingredients": ["Carne vacuna", "Pollo", "Cerdo", "Chorizo", "Morcilla"]},
    {"name": "Verduras", "ingredients": ["Tomate", "Lechuga", "Cebolla", "Pimiento", "Zanahoria", "Papa"]},
    {"name": "Lácteos", "ingredients": ["Queso mozzarella", "Queso parmesano", "Crema", "Manteca", "Leche"]},
    {"name": "Condimentos", "ingredients": ["Sal", "Pimienta", "Orégano", "Chimichurri", "Ajo"]},
    {"name": "Harinas", "ingredients": ["Harina de trigo", "Pan rallado", "Masa para empanadas", "Pasta seca"]},
    {"name": "Bebidas", "ingredients": ["Agua", "Hielo", "Jugo de limón", "Soda"]},
]


def _seed_catalogs(db: Session, tenant_id: int) -> None:
    """Seed cooking methods, flavors, textures, cuisine types, and ingredients."""
    cooking_methods = ["A la parrilla", "Frito", "Al horno", "A la plancha", "Hervido", "Al vapor"]
    for name in cooking_methods:
        db.add(CookingMethod(tenant_id=tenant_id, name=name))

    flavor_profiles = ["Salado", "Dulce", "Ácido", "Amargo", "Umami", "Picante"]
    for name in flavor_profiles:
        db.add(FlavorProfile(tenant_id=tenant_id, name=name))

    texture_profiles = ["Crujiente", "Cremoso", "Tierno", "Firme", "Suave"]
    for name in texture_profiles:
        db.add(TextureProfile(tenant_id=tenant_id, name=name))

    cuisine_types = ["Argentina", "Italiana", "Mediterránea", "Internacional"]
    for name in cuisine_types:
        db.add(CuisineType(tenant_id=tenant_id, name=name))

    for group_data in INGREDIENT_GROUPS_DATA:
        group = IngredientGroup(tenant_id=tenant_id, name=group_data["name"])
        db.add(group)
        db.flush()

        for ing_name in group_data["ingredients"]:
            ingredient = Ingredient(
                tenant_id=tenant_id,
                name=ing_name,
                group_id=group.id,
            )
            db.add(ingredient)
            db.flush()


def seed(db: Session, context: dict) -> dict:
    """
    Seed menu data (categories, subcategories, products with pricing and allergens).
    Requires context with 'tenant', 'branch', and 'allergens'.
    Returns dict with categories, subcategories, and products.
    """
    tenant = context["tenant"]
    branch = context["branch"]
    allergens = context.get("allergens", {})

    existing = db.query(Category).filter(Category.tenant_id == tenant.id).first()
    if existing:
        logger.info("Menu already exists, skipping menu seed")
        categories = {c.name: c for c in db.query(Category).filter(Category.tenant_id == tenant.id).all()}
        subcategories = {s.name: s for s in db.query(Subcategory).filter(Subcategory.tenant_id == tenant.id).all()}
        products = {p.name: p for p in db.query(Product).filter(Product.tenant_id == tenant.id).all()}
        return {"categories": categories, "subcategories": subcategories, "products": products}

    logger.info("Seeding menu...")

    # Seed tenant-scoped catalogs (cooking methods, flavors, etc.)
    _seed_catalogs(db, tenant.id)

    # Categories
    categories = {}
    for cat_data in CATEGORIES_DATA:
        category = Category(
            branch_id=branch.id,
            tenant_id=tenant.id,
            name=cat_data["name"],
            order=cat_data["order"],
        )
        db.add(category)
        db.flush()
        categories[cat_data["name"]] = category

    # Subcategories
    subcategories = {}
    for sub_data in SUBCATEGORIES_DATA:
        subcategory = Subcategory(
            category_id=categories[sub_data["category"]].id,
            tenant_id=tenant.id,
            name=sub_data["name"],
            order=sub_data["order"],
        )
        db.add(subcategory)
        db.flush()
        subcategories[sub_data["name"]] = subcategory

    # Products
    products = {}
    for prod_data in PRODUCTS_DATA:
        product = Product(
            tenant_id=tenant.id,
            name=prod_data["name"],
            description=prod_data.get("description"),
            category_id=categories[prod_data["category"]].id,
            subcategory_id=subcategories[prod_data["subcategory"]].id if prod_data.get("subcategory") else None,
            featured=prod_data.get("featured", False),
            popular=prod_data.get("popular", False),
        )
        db.add(product)
        db.flush()
        products[prod_data["name"]] = product

        branch_product = BranchProduct(
            tenant_id=tenant.id,
            branch_id=branch.id,
            product_id=product.id,
            price_cents=prod_data["price"],
            is_available=True,
        )
        db.add(branch_product)

        if "allergens" in prod_data:
            for allergen_name in prod_data["allergens"]:
                if allergen_name in allergens:
                    product_allergen = ProductAllergen(
                        tenant_id=tenant.id,
                        product_id=product.id,
                        allergen_id=allergens[allergen_name].id,
                        presence_type="contains",
                        risk_level="standard",
                    )
                    db.add(product_allergen)

    logger.info(f"Seeded {len(categories)} categories, {len(subcategories)} subcategories, {len(products)} products")
    return {"categories": categories, "subcategories": subcategories, "products": products}
