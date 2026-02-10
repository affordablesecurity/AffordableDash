@web_router.get("/customers/{customer_id}", response_class=HTMLResponse)
def customer_detail_page(
    customer_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_user),
    active_location_id: int = Depends(require_active_location_id),
):
    locations = list_user_locations(db, user.id)

    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.location_id == active_location_id
    ).first()

    if not customer or customer.is_archived:
        return RedirectResponse(url="/customers", status_code=302)

    from app.models.customer_contact import CustomerContact
    from app.models.customer_address import CustomerAddress

    contacts = (
        db.query(CustomerContact)
        .filter(CustomerContact.customer_id == customer.id)
        .order_by(CustomerContact.is_primary.desc(), CustomerContact.id.asc())
        .all()
    )
    addresses = (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == customer.id)
        .order_by(CustomerAddress.is_primary.desc(), CustomerAddress.id.asc())
        .all()
    )

    return templates.TemplateResponse(
        "customer_detail.html",
        {
            "request": request,
            "user": user,
            "locations": locations,
            "active_location_id": active_location_id,
            "customer": customer,
            "contacts": contacts,
            "addresses": addresses,
            "error": None,
        },
    )
