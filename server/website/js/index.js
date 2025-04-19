document.getElementById('copyright-footer').innerText = `${new Date().getFullYear()} © M&F Technology Development, All Rights Reserved.`;
(() => document.addEventListener('DOMContentLoaded', () => {
    // Inject contact.
    document.body.insertAdjacentHTML('beforeEnd', `
    <dialog open id="contact_dialog" style="opacity:0; display:none;">
        <form><button class="rotateAnim" typ e="submit" aria-label="close" formmethod="dialog" formnovalidate style="cursor: pointer;font-weight: 1000;margin: 0;padding: 0;font-family: cursive;">X</button></form>
        <h2>Contact</h2>
        <p>Write the reason why you want us to contact you and how we can help you.</p>
        <input autocomplete="email" type="email" name="email" id="contact_dialog_email" placeholder="Your email">
        <input autocomplete="name" type="text" name="name" id="contact_dialog_name" placeholder="Your name">
        <textarea autocomplete="off" type="text" name="context" id="contact_dialog_context" placeholder="Your reason for contacting us"></textarea>
        <form><button type="submit" aria-label="close" formmethod="dialog" formnovalidate class="send">Contact</button></form>
    </dialog>`);
    (() => {
        let contact_button = document.getElementById('contact-button');
        let contact_dialog = document.getElementById('contact_dialog');
        let dialog_email = document.getElementById('contact_dialog_email');
        let dialog_name = document.getElementById('contact_dialog_name');
        let dialog_context = document.getElementById('contact_dialog_context');

        const showDialog = () => {
            if (!contact_dialog.classList.contains('animateIn')) {
                contact_dialog.style.display = 'block';
                contact_button.disabled = true;
                return new Promise((resolve) => {
                    contact_dialog.classList.remove('animateOut');
                    contact_dialog.classList.add('animateIn');
                    setTimeout(() => {
                        contact_button.disabled = false;
                        resolve();
                    }, 500);
                });
            }
        }

        const hideDialog = () => {
            if (!contact_dialog.classList.contains('animateOut')) {
                contact_button.disabled = true;
                return new Promise((resolve) => {
                    contact_dialog.classList.remove('animateIn');
                    contact_dialog.classList.add('animateOut');
                    setTimeout(() => {
                        contact_dialog.style.display = 'none';
                        contact_button.disabled = false;
                        resolve();
                    }, 500);
                });
            }
        }

        // Close dialog.
        contact_dialog.getElementsByTagName('form')[0].addEventListener('submit', (event) => {
            event.preventDefault();
            hideDialog();
        });

        // Submit contact.
        contact_dialog.getElementsByTagName('form')[1].addEventListener('submit', (event) => {
            event.preventDefault();

            // Elements
            let email = dialog_email.value;
            let name = dialog_name.value;
            let context = dialog_context.value;

            // Validation
            if (email.replace(/\s/g, '').length <= 0)
                return alert('Empty email.');
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return alert('Invalid email.');
            else if (name.replace(/\s/g, '').length <= 0)
                return alert('Empty name.');
            else if (name.replace(/\s/g, '').length <= 9)
                return alert('Minium of 10 characters.');
            else if (context.replace(/\s/g, '').length <= 0)
                return alert('Empty context.');
            else if (context.replace(/\s/g, '').length <= 24)
                return alert('Minium of 25 characters.');

            // Send
            contact_dialog.getElementsByTagName('form')[1].getElementsByTagName('button')[0].style.display = 'none';
            fetch('/contact', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        name: name,
                        context: context
                    })
                })
                .then((response) => response.json())
                .then((response) => {
                    dialog_email.value = '';
                    dialog_name.value = '';
                    dialog_context.value = '';
                    hideDialog().then(() => {
                        alert(response.response);
                        contact_dialog.getElementsByTagName('form')[1].getElementsByTagName('button')[0].style.display = 'block';
                    });
                })
                .catch((reason) => hideDialog().then(() => alert(`Error sending email. ${reason}`)));
            
        });
        contact_button.addEventListener('click', showDialog);
    })();
}))();