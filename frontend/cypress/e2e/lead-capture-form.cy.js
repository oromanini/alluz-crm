describe('Landing page lead capture form', () => {
  it('envia lead via POST para o webhook com os campos obrigatórios', () => {
    cy.intercept('POST', '**/api/webhooks/lead-capture', (req) => {
      req.reply({
        statusCode: 200,
        body: { status: 'ok' },
      });
    }).as('leadCapture');

    cy.visit('/landingpage?utm_source=google&utm_medium=cpc&utm_campaign=campanha-teste');

    cy.get('[data-testid="input-nome-hero"]').type('Maria da Silva');
    cy.get('[data-testid="input-cidade-hero"]').type('Maringá');
    cy.get('[data-testid="input-telefone-hero"]').type('44988574869');
    cy.get('[data-testid="submit-form-hero"]').click();

    cy.wait('@leadCapture').then(({ request }) => {
      expect(request.method).to.equal('POST');
      expect(request.body).to.deep.include({
        nome: 'Maria da Silva',
        cidade: 'Maringá',
        origem: 'Site Alluz - Landing Page',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'campanha-teste',
      });
      expect(request.body.telefone).to.match(/^\(44\)\s98857-4869$/);
    });
  });

  it('não envia requisição quando campos obrigatórios não estão preenchidos', () => {
    cy.intercept('POST', '**/api/webhooks/lead-capture').as('leadCapture');

    cy.visit('/landingpage');
    cy.get('[data-testid="submit-form-hero"]').click();

    cy.get('@leadCapture.all').should('have.length', 0);
  });
});
